export class VariableScope {
    private subVariables = new Map<number, { name: string; value: any }[]>();
    private variables = new Map<number, { name: string; value: any }>();

    public readonly id: number;

    constructor(id: number) {
        this.id = id;
    }

    public getIdFor(name: string) {
        let ids = Array.from(this.variables.keys());
        return ids.findIndex(v => {
            return this.variables.get(v)?.name === name;
        });
    }

    public getSubVariableFor(name: string, id: number) {
        let subVariables = this.subVariables.get(id);
        if (subVariables) {
            let index = subVariables.findIndex(sv => {
                return sv.name === name;
            });
            if (index !== -1) {
                return subVariables[index];
            }
        }

        return undefined;
    }

    public getSubVariablesFor(id: number) {
        return this.subVariables.get(id);
    }

    public getVariable(id: number): { name: string; value: any } | undefined {
        return this.variables.get(id);
    }

    public getVariableIds() {
        return Array.from(this.variables.keys());
    }

    public setSubVariableFor(variableId: number, name: string, value: any) {
        let subVariables = this.subVariables.get(variableId);
        if (!subVariables) {
            subVariables = [];
            this.subVariables.set(variableId, subVariables);
        }

        let index = subVariables.findIndex(sv => {
            return sv.name === name;
        });

        if (index === -1) {
            subVariables.push({ name: name, value: value });
        }
    }

    public setVariable(name: string, value: any, id: number) {
        let variable = { name: name, value: value };
        this.variables.set(id, variable);
    }
}
