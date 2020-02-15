enum GDScriptTypes {
    NIL,

    // atomic types
    BOOL,
    INT,
    REAL,
    STRING,

    // math types

    VECTOR2, // 5
    RECT2,
    VECTOR3,
    TRANSFORM2D,
    PLANE,
    QUAT, // 10
    AABB,
    BASIS,
    TRANSFORM,

    // misc types
    COLOR,
    NODE_PATH, // 15
    _RID,
    OBJECT,
    DICTIONARY,
    ARRAY,

    // arrays
    POOL_BYTE_ARRAY, // 20
    POOL_INT_ARRAY,
    POOL_REAL_ARRAY,
    POOL_STRING_ARRAY,
    POOL_VECTOR2_ARRAY,
    POOL_VECTOR3_ARRAY, // 25
    POOL_COLOR_ARRAY,

    VARIANT_MAX
}

interface BufferModel {
    // #region Properties (3)

    buffer: Buffer;
    len: number;
    offset: number;

    // #endregion Properties (3)
}

export class VariantParser {
    // #region Public Methods (3)

    public decodeVariant(model: BufferModel) {        
        let type = this.decodeUInt32(model);
        switch (type & 0xff) {
            case GDScriptTypes.BOOL:
                return this.decodeUInt32(model) !== 0;
            case GDScriptTypes.INT:
                if (type & (1 << 16)) {
                    return this.decodeInt64(model);
                } else {
                    return this.decodeInt32(model);
                }
            case GDScriptTypes.REAL:
                if(type & 1 << 16) {
                    return this.decodeDouble(model);
                }
                else {
                    return this.decodeFloat(model);
                }
            case GDScriptTypes.STRING:
                return this.decodeString(model);
            case GDScriptTypes.VECTOR2:
                return this.decodeVector2(model);
            case GDScriptTypes.RECT2:
                return this.decodeRect2(model);
            case GDScriptTypes.VECTOR3:
                return this.decodeVector3(model);
            case GDScriptTypes.TRANSFORM2D:
                return this.decodeTransform2(model);
            case GDScriptTypes.PLANE:
                return this.decodePlane(model);
            case GDScriptTypes.QUAT:
                return this.decodeQuat(model);
            case GDScriptTypes.AABB:
                return this.decodeAABB(model);
            case GDScriptTypes.BASIS:
                return this.decodeBasis(model);
            case GDScriptTypes.TRANSFORM:
                return this.decodeTransform(model);
            case GDScriptTypes.COLOR:
                return this.decodeColor(model);
            case GDScriptTypes.NODE_PATH:
                return this.decodeNodePath(model);
            case GDScriptTypes.OBJECT:
                if (type & (1 << 16)) {
                    //TODO: Fix decodeObject(model)
                    return this.decodeObjectId(model);
                } else {
                    return this.decodeObjectId(model);
                }
            case GDScriptTypes.DICTIONARY:
                return this.decodeDictionary(model);
            case GDScriptTypes.ARRAY:
                return this.decodeArray(model);
            case GDScriptTypes.POOL_BYTE_ARRAY:
                return this.decodePoolByteArray(model);
            case GDScriptTypes.POOL_INT_ARRAY:
                return this.decodePoolIntArray(model);
            case GDScriptTypes.POOL_REAL_ARRAY:
                return this.decodePoolFloatArray(model);
            case GDScriptTypes.POOL_STRING_ARRAY:
                return this.decodePoolStringArray(model);
            case GDScriptTypes.POOL_VECTOR2_ARRAY:
                return this.decodePoolVector2Array(model);
            case GDScriptTypes.POOL_VECTOR3_ARRAY:
                return this.decodePoolVector3Array(model);
            case GDScriptTypes.POOL_COLOR_ARRAY:
                return this.decodePoolColorArray(model);
            default:
                return undefined;
        }
    }

    public encodeVariant(
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

    public getBufferDataSet(buffer: Buffer, offset: number) {
        let len = buffer.readUInt32LE(offset);
        let model: BufferModel = {
            buffer: buffer,
            offset: offset + 4,
            len: len
        };

        let output = [];
        output.push(len + 4);
        do {
            let value = this.decodeVariant(model);
            output.push(value);
        } while (model.len > 0);

        return output;
    }

    // #endregion Public Methods (3)

    // #region Private Methods (39)

    private decodeAABB(model: BufferModel) {
        let px = this.decodeFloat(model);
        let py = this.decodeFloat(model);
        let pz = this.decodeFloat(model);
        let sx = this.decodeFloat(model);
        let sy = this.decodeFloat(model);
        let sz = this.decodeFloat(model);

        return {
            position: { x: px, y: py, z: pz },
            size: { x: sx, y: sy, z: sz }
        };
    }

    private decodeArray(model: BufferModel) {
        let output: Array<any> = [];

        let count = this.decodeUInt32(model);

        for (let i = 0; i < count; i++) {
            let value = this.decodeVariant(model);
            output.push(value);
        }

        return output;
    }

    private decodeBasis(model: BufferModel) {
        let x = this.decodeVector3(model);
        let y = this.decodeVector3(model);
        let z = this.decodeVector3(model);

        return { x: x, y: y, z: z };
    }

    private decodeColor(model: BufferModel) {
        let r = this.decodeFloat(model);
        let g = this.decodeFloat(model);
        let b = this.decodeFloat(model);
        let a = this.decodeFloat(model);

        return { r: r, g: g, b: b, a: a };
    }

    private decodeDictionary(model: BufferModel) {
        let output = new Map<any, any>();

        let count = this.decodeUInt32(model);
        for (let i = 0; i < count; i++) {
            let key = this.decodeVariant(model);
            let value = this.decodeVariant(model);
            output.set(key, value);
        }

        return output;
    }
    
    private decodeFloat(model: BufferModel) {
        let view = new DataView(model.buffer.buffer, model.offset, 4);
        let f = view.getFloat32(0, true);
        
        model.offset += 4;
        model.len -= 4;
        
        return f;
    }

    private decodeDouble(model: BufferModel) {
        let view = new DataView(model.buffer.buffer, model.offset, 8);
        let d = view.getFloat64(0, true);
        
        model.offset += 8;
        model.len -= 8;
        
        return d;
    }

    private decodeInt32(model: BufferModel) {
        let u = model.buffer.readInt32LE(model.offset);
        model.len -= 4;
        model.offset += 4;

        return u;
    }

    private decodeInt64(model: BufferModel) {
        let u = model.buffer.readBigInt64LE(model.offset);
        model.len -= 8;
        model.offset += 8;

        return u;
    }

    private decodeNodePath(model: BufferModel) {
        let nameCount = this.decodeUInt32(model) & 0x7fffffff;
        let subNameCount = this.decodeUInt32(model);
        let flags = this.decodeUInt32(model);
        let isAbsolute = (flags & 1) === 1;
        if (flags & 2) {
            //Obsolete format with property separate from subPath
            subNameCount++;
        }

        let total = nameCount + subNameCount;
        let names: string[] = [];
        let subNames: string[] = [];
        for (let i = 0; i < total; i++) {
            let str = this.decodeString(model);
            if (i < nameCount) {
                names.push(str);
            } else {
                subNames.push(str);
            }
        }

        return { path: names, subpath: subNames, absolute: isAbsolute };
    }

    private decodeObject(model: BufferModel) {
        let className = this.decodeString(model);
        let propCount = this.decodeUInt32(model);
        let props: { name: string; value: any }[] = [];
        for (let i = 0; i < propCount; i++) {
            let name = this.decodeString(model);
            let value = this.decodeVariant(model);
            props.push({ name: name, value: value });
        }

        return { class: className, properties: props };
    }

    private decodeObjectId(model: BufferModel) {
        return this.decodeUInt64(model);
    }

    private decodePlane(model: BufferModel) {
        let x = this.decodeFloat(model);
        let y = this.decodeFloat(model);
        let z = this.decodeFloat(model);
        let d = this.decodeFloat(model);

        return { x: x, y: y, z: z, d: d };
    }

    private decodePoolByteArray(model: BufferModel) {
        let count = this.decodeUInt32(model);
        let output: number[] = [];
        for (let i = 0; i < count; i++) {
            output.push(model.buffer.readUInt8(model.offset));
            model.offset++;
            model.len--;
        }

        return output;
    }

    private decodePoolColorArray(model: BufferModel) {
        let count = this.decodeUInt32(model);
        let output: { r: number; g: number; b: number; a: number }[] = [];
        for (let i = 0; i < count; i++) {
            output.push(this.decodeColor(model));
        }

        return output;
    }

    private decodePoolFloatArray(model: BufferModel) {
        let count = this.decodeUInt32(model);
        let output: number[] = [];
        for (let i = 0; i < count; i++) {
            output.push(this.decodeFloat(model));
        }

        return output;
    }

    private decodePoolIntArray(model: BufferModel) {
        let count = this.decodeUInt32(model);
        let output: number[] = [];
        for (let i = 0; i < count; i++) {
            output.push(this.decodeInt32(model));
        }

        return output;
    }

    private decodePoolStringArray(model: BufferModel) {
        let count = this.decodeUInt32(model);
        let output: string[] = [];
        for (let i = 0; i < count; i++) {
            output.push(this.decodeString(model));
        }

        return output;
    }

    private decodePoolVector2Array(model: BufferModel) {
        let count = this.decodeUInt32(model);
        let output: { x: number; y: number }[] = [];
        for (let i = 0; i < count; i++) {
            output.push(this.decodeVector2(model));
        }

        return output;
    }

    private decodePoolVector3Array(model: BufferModel) {
        let count = this.decodeUInt32(model);
        let output: { x: number; y: number; z: number }[] = [];
        for (let i = 0; i < count; i++) {
            output.push(this.decodeVector3(model));
        }

        return output;
    }

    private decodeQuat(model: BufferModel) {
        let x = this.decodeFloat(model);
        let y = this.decodeFloat(model);
        let z = this.decodeFloat(model);
        let w = this.decodeFloat(model);

        return { x: x, y: y, z: z, w: w };
    }

    private decodeRect2(model: BufferModel) {
        let x = this.decodeFloat(model);
        let y = this.decodeFloat(model);
        let sizeX = this.decodeFloat(model);
        let sizeY = this.decodeFloat(model);

        return { position: { x: x, y: y }, size: { x: sizeX, y: sizeY } };
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

    private decodeTransform(model: BufferModel) {
        let b = this.decodeBasis(model);
        let o = this.decodeVector3(model);

        return { basis: b, origin: o };
    }

    private decodeTransform2(model: BufferModel) {
        let origin = this.decodeVector2(model);
        let x = this.decodeVector2(model);
        let y = this.decodeVector2(model);

        return { origin: origin, x: x, y: y };
    }

    private decodeUInt32(model: BufferModel) {
        let u = model.buffer.readUInt32LE(model.offset);
        model.len -= 4;
        model.offset += 4;

        return u;
    }

    private decodeUInt64(model: BufferModel) {
        let u = model.buffer.readBigUInt64LE(model.offset);
        model.len -= 8;
        model.offset += 8;

        return u;
    }

    private decodeVector2(model: BufferModel) {
        let x = this.decodeFloat(model);
        let y = this.decodeFloat(model);

        return { x: x, y: y };
    }

    private decodeVector3(model: BufferModel) {
        let x = this.decodeFloat(model);
        let y = this.decodeFloat(model);
        let z = this.decodeFloat(model);

        return { x: x, y: y, z: z };
    }

    private encodeArray(arr: any[], model: BufferModel) {
        let size = arr.length;
        this.encodeUInt32(size, model);
        arr.forEach(e => {
            this.encodeVariant(e, model);
        });
    }

    private encodeBool(bool: boolean, model: BufferModel) {
        this.encodeUInt32(bool ? 1 : 0, model);
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

    private encodeUInt32(int: number, model: BufferModel) {
        model.buffer.writeUInt32LE(int, model.offset);
        model.offset += 4;
    }

    private sizeArray(arr: any[]): number {
        let size = this.sizeUint32();
        arr.forEach(e => {
            size += this.sizeVariant(e);
        });

        return size;
    }

    private sizeBool(): number {
        return this.sizeUint32();
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

    private sizeString(str: string): number {
        let size = this.sizeUint32() + str.length;
        while (size % 4) {
            size++;
        }
        return size;
    }

    private sizeUint32(): number {
        return 4;
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

    // #endregion Private Methods (39)
}