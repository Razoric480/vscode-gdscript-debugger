import { CommandBuilder } from "./CommandBuilder";
import { VariantParser } from "../VariantParser";
import net = require("net");

export class GodotCommands {
    private builder: CommandBuilder;
    private canWrite = false;
    private commandBuffer: Buffer[] = [];
    private connection: net.Socket | undefined;
    private parser: VariantParser;

    constructor(
        builder: CommandBuilder,
        parser: VariantParser,
        connection?: net.Socket
    ) {
        this.builder = builder;
        this.parser = parser;
        this.connection = connection;
    }

    public sendBreakCommand() {
        let buffer = this.builder.createBufferedCommand("break", this.parser);
        this.addAndSend(buffer);
    }

    public sendContinueCommand() {
        let buffer = this.builder.createBufferedCommand(
            "continue",
            this.parser
        );
        this.addAndSend(buffer);
    }

    public sendInspectObjectCommand(objectId: number) {
        let buffer = this.builder.createBufferedCommand(
            "inspect_object",
            this.parser,
            [objectId]
        );

        this.addAndSend(buffer);
    }

    public sendNextCommand() {
        let buffer = this.builder.createBufferedCommand("next", this.parser);
        this.addAndSend(buffer);
    }

    public sendRemoveBreakpointCommand(file: string, line: number) {
        this.sendBreakpointCommand(false, file, line);
    }

    public sendSetBreakpointCommand(file: string, line: number) {
        this.sendBreakpointCommand(true, file, line);
    }

    public sendSkipBreakpointsCommand(skipBreakpoints: boolean) {
        let buffer = this.builder.createBufferedCommand(
            "set_skip_breakpoints",
            this.parser,
            [skipBreakpoints]
        );

        this.addAndSend(buffer);
    }

    public sendStackDumpCommand() {
        let buffer = this.builder.createBufferedCommand(
            "get_stack_dump",
            this.parser
        );

        this.addAndSend(buffer);
    }

    public sendStackFrameVarsCommand(level: number) {
        let buffer = this.builder.createBufferedCommand(
            "get_stack_frame_vars",
            this.parser,
            [level]
        );

        this.addAndSend(buffer);
    }

    public sendStepCommand() {
        let buffer = this.builder.createBufferedCommand("step", this.parser);
        this.addAndSend(buffer);
    }

    public setCanWrite(value: boolean) {
        this.canWrite = value;
        if (this.canWrite) {
            this.sendBuffer();
        }
    }

    public setConnection(connection: net.Socket) {
        this.connection = connection;
        this.canWrite = true;
    }

    private addAndSend(buffer: Buffer) {
        this.commandBuffer.push(buffer);
        this.sendBuffer();
    }

    private sendBreakpointCommand(set: boolean, file: string, line: number) {
        let buffer = this.builder.createBufferedCommand(
            "breakpoint",
            this.parser,
            [file, line, set]
        );
        this.addAndSend(buffer);
    }

    private sendBuffer() {
        if (!this.connection) {
            return;
        }

        while (this.canWrite && this.commandBuffer.length > 0) {
            this.canWrite = this.connection.write(
                this.commandBuffer.shift() as Buffer
            );
        }
    }
}
