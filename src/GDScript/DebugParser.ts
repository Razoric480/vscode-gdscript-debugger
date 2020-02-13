enum GDScriptTypes {
    NIL,
    BOOL,
    INT,
    REAL,
    STRING,
    DICTIONARY = 18,
    ARRAY
}

export interface BufferModel {
    buffer: Buffer;
    offset: number;
    len: number;
}

export function getBufferModel(buffer: Buffer): BufferModel {
    let len = buffer.byteLength;
    return { buffer: buffer, offset: 4, len: len - 4 };
}

export function getBufferDataSet(model: BufferModel) {
    let output = [];
    do {
        let value = decodeVariant(model);
        if (value) {
            output.push(value);
        }
    } while (model.len > 0);

    return output;
}

function decodeUInt32(model: BufferModel) {
    let u = model.buffer.readUInt32LE(model.offset);
    model.len -= 4;
    model.offset += 4;

    return u;
}

function decodeString(model: BufferModel) {
    let len = decodeUInt32(model);
    let pad = 0;
    if (len % 4 !== 0) {
        pad = 4 - (len % 4);
    }

    let str = model.buffer.toString("utf8", model.offset, model.offset + len);
    len += pad;

    model.offset += len;
    model.len -= len;

    return str;
}

function decodeDictionary(model: BufferModel) {
    let output = new Map<any, any>();

    let count = decodeUInt32(model);
    for (let i = 0; i < count; i++) {
        let key = decodeVariant(model);
        let value = decodeVariant(model);
        if (key) {
            output.set(key, value);
        }
    }

    return output;
}

function decodeArray(model: BufferModel) {
    let output: Array<any> = [];

    let count = decodeUInt32(model);

    for (let i = 0; i < count; i++) {
        let value = decodeVariant(model);
        if (value) {
            output.push(value);
        }
    }

    return output;
}

export function decodeVariant(model: BufferModel) {
    let type = decodeUInt32(model) & 0xff;
    switch (type) {
        case GDScriptTypes.NIL:
            return undefined;
        case GDScriptTypes.BOOL:
            return decodeUInt32(model) !== 0;
        case GDScriptTypes.INT:
            return decodeUInt32(model);
        case GDScriptTypes.STRING:
            return decodeString(model);
        case GDScriptTypes.DICTIONARY:
            return decodeDictionary(model);
        case GDScriptTypes.ARRAY:
            return decodeArray(model);
        default:
            return undefined;
    }
}

function encodeBool(bool: boolean, model: BufferModel) {
    encodeUInt32(bool ? 1 : 0, model);
}

function encodeUInt32(int: number, model: BufferModel) {
    model.buffer.writeUInt32LE(int, model.offset);
    model.offset += 4;
}

function encodeString(str: string, model: BufferModel) {
    let strlen = str.length;
    encodeUInt32(strlen, model);
    model.buffer.write(str, model.offset, "utf8");
    model.offset += strlen;
    strlen += 4;
    while (strlen % 4) {
        strlen++;
        model.buffer.writeUInt8(0, model.offset);
        model.offset++;
    }
}

function encodeDictionary(dict: Map<any, any>, model: BufferModel) {
    let size = dict.size;
    encodeUInt32(size, model);
    let keys = Array.from(dict.keys());
    keys.forEach(key => {
        let value = dict.get(key);
        encodeVariant(key, model, true);
        encodeVariant(value, model, true);
    });
}

function encodeArray(arr: any[], model: BufferModel) {
    let size = arr.length;
    encodeUInt32(size, model);
    arr.forEach(e => {
        encodeVariant(e, model, true);
    });
}

function sizeUint32(): number {
    return 4;
}

function sizeBool(): number {
    return sizeUint32();
}

function sizeString(str: string): number {
    let size = sizeUint32() + str.length;
    while (size % 4) {
        size++;
    }
    return size;
}

function sizeArray(arr: any[]): number {
    let size = sizeUint32();
    arr.forEach(e => {
        size += sizeVariant(e);
    });

    return size;
}

function sizeDictionary(dict: Map<any, any>): number {
    let size = sizeUint32();
    let keys = Array.from(dict.keys());
    keys.forEach(key => {
        let value = dict.get(key);
        size += sizeVariant(key);
        size += sizeVariant(value);
    });

    return size;
}

function sizeVariant(
    value: number | boolean | string | Map<any, any> | any[] | undefined
): number {
    let size = 4;

    switch (typeof value) {
        case "number":
            size += sizeUint32();
            break;
        case "boolean":
            size += sizeBool();
            break;
        case "string":
            size += sizeString(value);
            break;
        case "undefined":
            break;
        default:
            if (Array.isArray(value)) {
                size += sizeArray(value);
                break;
            } else {
                size += sizeDictionary(value);
                break;
            }
    }

    return size;
}

export function encodeVariant(
    value: number | boolean | string | Map<any, any> | Array<any> | undefined,
    model: BufferModel,
    recursed = false
) {
    if (!recursed) {
        let size = sizeVariant(value);
        model.buffer = Buffer.alloc(size);
    }

    switch (typeof value) {
        case "number":
            encodeUInt32(GDScriptTypes.INT, model);
            encodeUInt32(value, model);
            break;
        case "boolean":
            encodeUInt32(GDScriptTypes.BOOL, model);
            encodeBool(value, model);
            break;
        case "string":
            encodeUInt32(GDScriptTypes.STRING, model);
            encodeString(value, model);
            break;
        case "undefined":
            break;
        default:
            if (Array.isArray(value)) {
                encodeUInt32(GDScriptTypes.ARRAY, model);
                encodeArray(value, model);
            } else {
                encodeUInt32(GDScriptTypes.DICTIONARY, model);
                encodeDictionary(value, model);
            }
    }
}
