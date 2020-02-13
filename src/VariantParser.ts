enum GDScriptTypes {
    NIL,
    BOOL,
    INT,
    REAL,
    STRING,
    DICTIONARY = 18,
    ARRAY
}

interface BufferModel {
    buffer: Buffer;
    offset: number;
    len: number;
}

export class VariantParser {
    getBufferDataSet(buffer: Buffer, offset: number) {
        let len = buffer.readUInt32LE(offset);
        let model: BufferModel = {
            buffer: buffer,
            offset: offset+4,
            len: len
        };

        let output = [];
        output.push(len+4);
        do {
            let value = this.decodeVariant(model);
            output.push(value);
        } while (model.len > 0);

        return output;
    }

    decodeVariant(model: BufferModel) {
        let type = this.decodeUInt32(model) & 0xff;
        switch (type) {
            case GDScriptTypes.BOOL:
                return this.decodeUInt32(model) !== 0;
            case GDScriptTypes.INT:
                return this.decodeUInt32(model);
            case GDScriptTypes.STRING:
                return this.decodeString(model);
            case GDScriptTypes.DICTIONARY:
                return this.decodeDictionary(model);
            case GDScriptTypes.ARRAY:
                return this.decodeArray(model);
            default:
                return undefined;
        }
    }

    encodeVariant(
        value:
            | number
            | boolean
            | string
            | Map<any, any>
            | Array<any>
            | undefined,
        model?: BufferModel
    ) {
        if (!model) {
            let size = this.sizeVariant(value);
            let buffer = Buffer.alloc(size + 4);
            model = {
                buffer: buffer,
                offset: 0,
                len: 0
            };
            this.encodeUInt32(size, model);
        }

        switch (typeof value) {
            case "number":
                this.encodeUInt32(GDScriptTypes.INT, model);
                this.encodeUInt32(value, model);
                break;
            case "boolean":
                this.encodeUInt32(GDScriptTypes.BOOL, model);
                this.encodeBool(value, model);
                break;
            case "string":
                this.encodeUInt32(GDScriptTypes.STRING, model);
                this.encodeString(value, model);
                break;
            case "undefined":
                break;
            default:
                if (Array.isArray(value)) {
                    this.encodeUInt32(GDScriptTypes.ARRAY, model);
                    this.encodeArray(value, model);
                } else {
                    this.encodeUInt32(GDScriptTypes.DICTIONARY, model);
                    this.encodeDictionary(value, model);
                }
        }

        return model.buffer;
    }

    private decodeUInt32(model: BufferModel) {
        let u = model.buffer.readUInt32LE(model.offset);
        model.len -= 4;
        model.offset += 4;

        return u;
    }

    private decodeString(model: BufferModel) {
        let len = this.decodeUInt32(model);
        let pad = 0;
        if (len % 4 !== 0) {
            pad = 4 - (len % 4);
        }

        let str = model.buffer.toString(
            "utf8",
            model.offset,
            model.offset + len
        );
        len += pad;

        model.offset += len;
        model.len -= len;

        return str;
    }

    private decodeDictionary(model: BufferModel) {
        let output = new Map<any, any>();

        let count = this.decodeUInt32(model);
        for (let i = 0; i < count; i++) {
            let key = this.decodeVariant(model);
            let value = this.decodeVariant(model);
            if (key) {
                output.set(key, value);
            }
        }

        return output;
    }

    private decodeArray(model: BufferModel) {
        let output: Array<any> = [];

        let count = this.decodeUInt32(model);

        for (let i = 0; i < count; i++) {
            let value = this.decodeVariant(model);
            if (value) {
                output.push(value);
            }
        }

        return output;
    }

    private encodeBool(bool: boolean, model: BufferModel) {
        this.encodeUInt32(bool ? 1 : 0, model);
    }

    private encodeUInt32(int: number, model: BufferModel) {
        model.buffer.writeUInt32LE(int, model.offset);
        model.offset += 4;
    }

    private encodeString(str: string, model: BufferModel) {
        let strLen = str.length;
        this.encodeUInt32(strLen, model);
        model.buffer.write(str, model.offset, "utf8");
        model.offset += strLen;
        strLen += 4;
        while (strLen % 4) {
            strLen++;
            model.buffer.writeUInt8(0, model.offset);
            model.offset++;
        }
    }

    private encodeDictionary(dict: Map<any, any>, model: BufferModel) {
        let size = dict.size;
        this.encodeUInt32(size, model);
        let keys = Array.from(dict.keys());
        keys.forEach(key => {
            let value = dict.get(key);
            this.encodeVariant(key, model);
            this.encodeVariant(value, model);
        });
    }

    private encodeArray(arr: any[], model: BufferModel) {
        let size = arr.length;
        this.encodeUInt32(size, model);
        arr.forEach(e => {
            this.encodeVariant(e, model);
        });
    }

    private sizeUint32(): number {
        return 4;
    }

    private sizeBool(): number {
        return this.sizeUint32();
    }

    private sizeString(str: string): number {
        let size = this.sizeUint32() + str.length;
        while (size % 4) {
            size++;
        }
        return size;
    }

    private sizeArray(arr: any[]): number {
        let size = this.sizeUint32();
        arr.forEach(e => {
            size += this.sizeVariant(e);
        });

        return size;
    }

    private sizeDictionary(dict: Map<any, any>): number {
        let size = this.sizeUint32();
        let keys = Array.from(dict.keys());
        keys.forEach(key => {
            let value = dict.get(key);
            size += this.sizeVariant(key);
            size += this.sizeVariant(value);
        });

        return size;
    }

    private sizeVariant(
        value: number | boolean | string | Map<any, any> | any[] | undefined
    ): number {
        let size = 4;

        switch (typeof value) {
            case "number":
                size += this.sizeUint32();
                break;
            case "boolean":
                size += this.sizeBool();
                break;
            case "string":
                size += this.sizeString(value);
                break;
            case "undefined":
                break;
            default:
                if (Array.isArray(value)) {
                    size += this.sizeArray(value);
                    break;
                } else {
                    size += this.sizeDictionary(value);
                    break;
                }
        }

        return size;
    }
}
