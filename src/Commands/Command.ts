export interface CommandChain {
    command: Command;
    paramCount: number;
}

export class Command {
    private parameters: Array<
        boolean | number | string | {} | [] | undefined
    > = [];
    private callback?: (
        parameters: Array<boolean | number | string | {} | [] | undefined>
    ) => void | undefined;
    private paramCountCallback?: (paramCount: number) => number;
    name: string;
    private paramCount = -1;

    constructor(
        name: string,
        parametersFulfilled?: (parameters: Array<any>) => void | undefined,
        modifyParamCount?: (paramCount: number) => number
    ) {
        this.name = name;
        this.callback = parametersFulfilled;
        this.paramCountCallback = modifyParamCount;
    }

    appendParameter(
        parameter: boolean | number | string | {} | [] | undefined
    ) {
        if (this.paramCount <= 0) {
            this.paramCount = parameter as number;
            return;
        }

        this.parameters.push(parameter);

        if (this.parameters.length === this.getParamCount()) {
            if (this.callback) {
                this.callback(this.parameters);
            }
        }
    }

    protected getParamCount() {
        return this.paramCountCallback
            ? this.paramCountCallback(this.paramCount)
            : this.paramCount;
    }

    chain() {
        if (this.parameters.length === this.getParamCount()) {
            this.parameters.length = 0;
            this.paramCount = -1;
            return undefined;
        } else {
            return this;
        }
    }
}
