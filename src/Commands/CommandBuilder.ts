import { Command } from "./Command";

export class CommandBuilder {
    private commands = new Map<string,Command>();
    private current_command?: Command;

    constructor() {}

    parseData(dataset: Array<any>): void {
        while (dataset && dataset.length > 0) {
            if (this.current_command) {
                if (this.current_command.checkHasFired()) {
                    this.current_command = undefined;
                } else {
                    this.current_command.appendParameter(dataset.shift());
                }
            } else {
                let command = this.commands.get(dataset[0]);
                if (command) {
                    this.current_command = command;
                    dataset.shift();
                } else {
                    console.log("Unrecognized command: " + dataset[0]);
                }
            }
        }
    }

    registerCommand(command: Command) {
        let name = command.name;
        this.commands.set(name, command);
    }
}