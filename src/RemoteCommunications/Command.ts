export class Command {
    // #region Properties (5)

    private callback?: (
        parameters: Array<boolean | number | string | {} | [] | undefined>
    ) => void | undefined;
    private paramCount = -1;
    private paramCountCallback?: (paramCount: number) => number;
    private parameters: Array<
        boolean | number | string | {} | [] | undefined
    > = [];

    public name: string;

    // #endregion Properties (5)

    // #region Constructors (1)

    constructor(
        name: string,
        parametersFulfilled?: (parameters: Array<any>) => void | undefined,
        modifyParamCount?: (paramCount: number) => number
    ) {
        this.name = name;
        this.callback = parametersFulfilled;
        this.paramCountCallback = modifyParamCount;
    }

    // #endregion Constructors (1)

    // #region Public Methods (2)

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

    // #endregion Public Methods (2)

    // #region Protected Methods (1)

    protected getParamCount() {
        return this.paramCountCallback
            ? this.paramCountCallback(this.paramCount)
            : this.paramCount;
    }

    // #endregion Protected Methods (1)
}
