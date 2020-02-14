import {
    Logger,
    logger,
    LoggingDebugSession,
    InitializedEvent,
    TerminatedEvent,
    StoppedEvent,
    BreakpointEvent,
    OutputEvent,
    Thread,
    StackFrame,
    Scope,
    Source,
    Handles,
    Breakpoint
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { GodotDebugRuntime, GodotBreakpoint } from "./godotDebugRuntime";
const { Subject } = require("await-notify");
import * as vscode from "vscode";
import fs = require("fs");

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    project: string;
    port: number;
    address: string;
}

export class GodotDebugSession extends LoggingDebugSession {
    private static THREAD_ID = 1;

    private runtime: GodotDebugRuntime;
    private configurationDone = new Subject();

    public constructor() {
        super();

        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        this.runtime = new GodotDebugRuntime();

        this.runtime.on("stopOnBreakpoint", () => {
            this.sendEvent(
                new StoppedEvent("breakpoint", GodotDebugSession.THREAD_ID)
            );
        });

        this.runtime.on("breakpointValidated", (bp: GodotBreakpoint) => {
            this.sendEvent(
                new BreakpointEvent("changed", <DebugProtocol.Breakpoint>{
                    verified: bp.verified,
                    id: bp.id
                })
            );
        });
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        response.body = response.body || {};

        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = true;
        response.body.supportsBreakpointLocationsRequest = true;

        this.sendResponse(response);

        this.sendEvent(new InitializedEvent());
    }

    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments
    ): void {
        super.configurationDoneRequest(response, args);

        this.configurationDone.notify();
    }

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: LaunchRequestArguments
    ) {
        await this.configurationDone.wait(1000);
        this.runtime.start(args.project, args.address, args.port);
        this.sendResponse(response);
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        const path = args.source.path as string;
        const clientLines = args.lines || [];

        if (fs.existsSync(path)) {
            this.runtime.clearBreakpoints(path);

            const actualBreakPoints = clientLines.map(l => {
                let { verified, file, line, id } = this.runtime.setBreakPoint(
                    path,
                    this.convertClientLineToDebugger(l)
                );
                const bp = new Breakpoint(
                    verified,
                    this.convertDebuggerLineToClient(line)
                );
            });
        }
    }

    protected breakpointLocationsRequest(
        response: DebugProtocol.BreakpointLocationsResponse,
        args: DebugProtocol.BreakpointLocationsArguments,
        request?: DebugProtocol.Request
    ): void {}

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [new Thread(GodotDebugSession.THREAD_ID, "thread_1")]
        };
        this.sendResponse(response);
    }

    protected stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): void {}

    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments
    ): void {}

    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments,
        request?: DebugProtocol.Request
    ) {}

    protected continueRequest(
        response: DebugProtocol.ContinueResponse,
        args: DebugProtocol.ContinueArguments
    ): void {}

    protected reverseContinueRequest(
        response: DebugProtocol.ReverseContinueResponse,
        args: DebugProtocol.ReverseContinueArguments
    ): void {}

    protected nextRequest(
        response: DebugProtocol.NextResponse,
        args: DebugProtocol.NextArguments
    ): void {}

    protected stepBackRequest(
        response: DebugProtocol.StepBackResponse,
        args: DebugProtocol.StepBackArguments
    ): void {}

    protected evaluateRequest(
        resposne: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ): void {}

    protected dataBreakpointInfoRequest(
        response: DebugProtocol.DataBreakpointInfoResponse,
        args: DebugProtocol.DataBreakpointInfoArguments
    ): void {}

    protected setDataBreakpointRequest(
        response: DebugProtocol.SetDataBreakpointsResponse,
        args: DebugProtocol.SetDataBreakpointsArguments
    ): void {}

    protected completionsRequest(
        response: DebugProtocol.CompletionsResponse,
        args: DebugProtocol.CompletionsArguments
    ): void {}

    protected cancelRequest(
        response: DebugProtocol.CancelResponse,
        args: DebugProtocol.CancelArguments
    ) {}
}
