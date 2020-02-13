import * as dp from "../GDScript/DebugParser";

export class Command {
    private parameters: Array<
        boolean | number | string | {} | [] | undefined
    > = [];
    private callback?: (
        parameters: Array<boolean | number | string | {} | [] | undefined>
    ) => void | undefined;
    name: string;
    paramCount = -1;
    private hasFired = false;

    constructor(
        name: string,
        parametersFulfilled?: (parameters: Array<any>) => void | undefined
    ) {
        this.name = name;
        this.callback = parametersFulfilled;
    }

    appendParameter(
        parameter: boolean | number | string | {} | [] | undefined
    ) {
        if (this.paramCount === -1) {
            this.paramCount = parameter as number;
            return;
        }

        this.parameters.push(parameter);

        if (this.parameters.length === this.paramCount) {
            this.hasFired = true;
            if (this.callback) {
                this.callback(this.parameters);
            }
        }
    }

    checkHasFired() {
        if (this.hasFired) {
            this.hasFired = false;
            this.parameters.length = 0;
            this.paramCount = 0;
            return true;
        }

        return false;
    }
}
