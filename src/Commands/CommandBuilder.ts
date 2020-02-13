import * as dp from "../GDScript/DebugParser";
import { Command } from "./Command";

enum CommandTypes {
    ENTER_DEBUG = "enter_debug"
}

export class CommandBuilder {
    private commands: Map<string, Command> = new Map<string, Command>();
    private current_command?: Command;

    constructor() {}

    parseData(dataset: Array<any>): void {
        while (dataset && dataset.length > 0) {
            if (this.current_command) {
                while (!this.current_command.fired) {
                    this.current_command.appendParameter(dataset.shift());
                }
                this.current_command.reset();
                this.current_command = undefined;
            } else {
                if (this.commands.has(dataset[0])) {
                    this.current_command = this.commands.get(dataset.shift());
                } else {
                    console.log("Unrecognized command: " + dataset[0]);
                }
            }
        }
    }

    registerCommand(command: Command) {
        let name = command.name();
        this.commands.set(name, command);
    }
}
