import { Command } from "./Command";

export class DebugEnterCommand extends Command {
    paramCountModified(): boolean {
        return false;
    }
    name(): string {
        return "debug_enter";
    }
    
    paramCount(): number {
        return 3;
    }
}
