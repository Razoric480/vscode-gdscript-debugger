import { Command } from "./Command";
import { VariantParser } from "../VariantParser";

export class CommandBuilder {
    private commands = new Map<string, Command>();
    private currentCommand?: Command;

    constructor() {}

    public createBufferedCommand(
        command: string,
        parser: VariantParser,
        parameters?: any[]
    ): Buffer {
        let commandArray: any[] = [command];
        if (parameters) {
            parameters?.forEach(param => {
                commandArray.push(param);
            });
        }

        let buffer = parser.encodeVariant(commandArray);
        return buffer;
    }

    public parseData(dataset: Array<any>): void {
        while (dataset && dataset.length > 0) {
            if (this.currentCommand) {
                let nextCommand = this.currentCommand.chain();
                if (nextCommand === this.currentCommand) {
                    this.currentCommand.appendParameter(dataset.shift());
                } else {
                    this.currentCommand = nextCommand;
                }
            } else {
                let data = dataset.shift();
                let command = this.commands.get(data);
                if (command) {
                    this.currentCommand = command;
                } else {
                    console.error(`Unsupported command: ${data}`);
                }
            }
        }
    }

    public registerCommand(command: Command) {
        let name = command.name;
        this.commands.set(name, command);
    }
}
