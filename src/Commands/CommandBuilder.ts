import { Command } from "./Command";
import { VariantParser } from "../VariantParser";

export class CommandBuilder {
    private commands = new Map<string, Command>();
    private currentCommand?: Command;

    constructor() {}

    parseData(dataset: Array<any>): void {
        while (dataset && dataset.length > 0) {
            if (this.currentCommand) {
                let nextCommand = this.currentCommand.chain();
                if (nextCommand === this.currentCommand) {
                    this.currentCommand.appendParameter(dataset.shift());
                } else {
                    this.currentCommand = nextCommand;
                }
            } else {
                let command = this.commands.get(dataset.shift());
                if (command) {
                    this.currentCommand = command;
                } else {

                }
            }
        }
    }

    registerCommand(command: Command) {
        let name = command.name;
        this.commands.set(name, command);
    }

    createBufferedCommand(
        command: string,
        parser: VariantParser,
        parameters?: any[]
    ): Buffer {
        let commandArray: any[] = [command];
        if (parameters) {
            commandArray.push(parameters.length);
            parameters?.forEach(param => {
                commandArray.push(param);
            });
        }

        let buffer = parser.encodeVariant(commandArray);
        return buffer;
    }
}
