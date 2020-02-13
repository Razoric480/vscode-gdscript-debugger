import { Command } from "./Command";

export class OutputCommand extends Command {
    paramCountModified(): boolean {
        return true;
    }
    name(): string {
        return "output";
    }

    paramCount(): number {
        return 1;
    }
}
