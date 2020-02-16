export class Command {
    private callback?: (
        parameters: Array<boolean | number | string | {} | [] | undefined>
    ) => void | undefined;
    private paramCount = -1;
    private paramCountCallback?: (paramCount: number) => number;
    private parameters: Array<
        boolean | number | string | {} | [] | undefined
    > = [];

    public name: string;

    constructor(
        name: string,
        parametersFulfilled?: (parameters: Array<any>) => void | undefined,
        modifyParamCount?: (paramCount: number) => number
    ) {
        this.name = name;
        this.callback = parametersFulfilled;
        this.paramCountCallback = modifyParamCount;
    }

    public appendParameter(
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

    public chain() {
        if (this.parameters.length === this.getParamCount()) {
            this.parameters.length = 0;
            this.paramCount = -1;
            return undefined;
        } else {
            return this;
        }
    }

    protected getParamCount() {
        return this.paramCountCallback
            ? this.paramCountCallback(this.paramCount)
            : this.paramCount;
    }
}
