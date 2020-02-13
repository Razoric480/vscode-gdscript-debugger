import * as dp from "../GDScript/DebugParser";

export abstract class Command {
    private parameters: Array<
        boolean | number | string | {} | [] | undefined
    > = [];
    private callback?: (
        parameters: Array<boolean | number | string | {} | [] | undefined>
    ) => void | undefined;
    fired = false;

    constructor(
        parametersFulfilled?: (parameters: Array<any>) => void | undefined
    ) {
        this.callback = parametersFulfilled;
    }

    abstract name(): string;

    abstract paramCount(): number;
    
    abstract paramCountModified(): boolean;

    appendParameter(
        parameter: boolean | number | string | {} | [] | undefined
    ) {
        let paramCount = this.paramCount();
        if(this.paramCountModified() && this.parameters.length > 0) {
            paramCount += this.parameters[0] as number;
        }
        if (this.parameters.length === paramCount) {
            return;
        }

        this.parameters.push(parameter);
        if (this.parameters.length === paramCount) {
            this.fired = true;
            if (this.callback) {
                this.callback(this.parameters);
            }
        }
    }

    reset() {
        this.fired = false;
    }
}
