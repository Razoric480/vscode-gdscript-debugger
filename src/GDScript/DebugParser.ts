export enum GDScriptTypes {
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

export function decodeUInt32(model: BufferModel) {
    let u = model.buffer.readUInt32LE(model.offset);
    model.len -= 4;
    model.offset += 4;

    return u;
}

export function decodeString(model: BufferModel) {
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

export function decodeDictionary(model: BufferModel) {
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

export function decodeArray(model: BufferModel) {
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
