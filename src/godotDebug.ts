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

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    project: string;
    port: number;
    address: string;
}

export class GodotDebugSession extends LoggingDebugSession {
    private static THREAD_ID = 1;
    
    private runtime: GodotDebugRuntime;

    public constructor() {
        super();
        
        this.runtime = new GodotDebugRuntime();
        
        this.runtime.on('stopOnStep', () => {
            this.sendEvent(new StoppedEvent('step', GodotDebugSession.THREAD_ID));
        });
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {}

    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments
    ): void {}

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: LaunchRequestArguments
    ) {}

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {}

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
