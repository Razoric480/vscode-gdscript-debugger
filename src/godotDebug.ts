import {
    LoggingDebugSession,
    InitializedEvent,
    TerminatedEvent,
    StoppedEvent,
    BreakpointEvent,
    Thread,
    Source,
    Breakpoint,
    Variable
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import {
    GodotDebugRuntime,
    GodotBreakpoint,
    GodotStackFrame
} from "./godotDebugRuntime";
const { Subject } = require("await-notify");
import fs = require("fs");

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    // #region Properties (3)

    address: string;
    port: number;
    project: string;

    // #endregion Properties (3)
}

export class GodotDebugSession extends LoggingDebugSession {
    // #region Properties (6)

    private static THREAD_ID = 1;

    private configurationDone = new Subject();
    private lastFrames: GodotStackFrame[] | undefined;
    private runtime: GodotDebugRuntime;
    private scopeId = 1;
    private scopes: { name: string; value: any }[][] = [
        [{ name: "filler", value: 0 }]
    ];

    // #endregion Properties (6)

    // #region Constructors (1)

    public constructor() {
        super();

        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        this.runtime = new GodotDebugRuntime();

        this.runtime.on("stopOnBreakpoint", frames => {
            this.lastFrames = frames;
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

        this.runtime.on("terminated", () => {
            this.sendEvent(new TerminatedEvent(false));
        });
    }

    // #endregion Constructors (1)

    // #region Protected Methods (16)

    protected breakpointLocationsRequest(
        response: DebugProtocol.BreakpointLocationsResponse,
        args: DebugProtocol.BreakpointLocationsArguments,
        request?: DebugProtocol.Request
    ): void {}

    protected cancelRequest(
        response: DebugProtocol.CancelResponse,
        args: DebugProtocol.CancelArguments
    ) {}

    protected completionsRequest(
        response: DebugProtocol.CompletionsResponse,
        args: DebugProtocol.CompletionsArguments
    ): void {}

    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments
    ): void {
        super.configurationDoneRequest(response, args);

        this.configurationDone.notify();
    }

    protected continueRequest(
        response: DebugProtocol.ContinueResponse,
        args: DebugProtocol.ContinueArguments
    ): void {
        response.body = {
            allThreadsContinued: true
        };

        this.runtime.continue();

        this.sendResponse(response);
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        response.body = response.body || {};

        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = false;
        response.body.supportsStepBack = false;
        response.body.supportsBreakpointLocationsRequest = false;
        response.body.supportsCancelRequest = false;
        response.body.supportsCompletionsRequest = false;
        response.body.supportsConditionalBreakpoints = false;
        response.body.supportsDataBreakpoints = false;
        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsGotoTargetsRequest = false;
        response.body.supportsHitConditionalBreakpoints = false;
        response.body.supportsLogPoints = false;
        response.body.supportsModulesRequest = false;
        response.body.supportsReadMemoryRequest = false;
        response.body.supportsRestartFrame = false;
        response.body.supportsRestartRequest = false;
        response.body.supportsSetExpression = false;
        response.body.supportsSetVariable = false;
        response.body.supportsStepInTargetsRequest = false;
        response.body.supportsTerminateThreadsRequest = false;
        response.body.supportsTerminateRequest = true;

        this.sendResponse(response);

        this.sendEvent(new InitializedEvent());
    }

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: LaunchRequestArguments
    ) {
        await this.configurationDone.wait(1000);
        this.runtime.start(args.project, args.address, args.port);
        this.sendResponse(response);
    }

    protected nextRequest(
        response: DebugProtocol.NextResponse,
        args: DebugProtocol.NextArguments
    ): void {
        this.runtime.step();
        this.sendResponse(response);
    }

    protected pauseRequest(
        response: DebugProtocol.PauseResponse,
        args: DebugProtocol.PauseArguments,
        request?: DebugProtocol.PauseRequest
    ): void {
        this.runtime.break();
        this.sendResponse(response);
    }

    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments
    ): void {
        this.runtime.getScope(args.frameId, scopes => {
            let localScope: DebugProtocol.Scope = {
                name: "Locals",
                namedVariables: scopes.locals.length / 2,
                presentationHint: "locals",
                expensive: false,
                variablesReference: this.scopeId++
            };
            let localScopeValues: { name: string; value: any }[] = [];
            for (let i = 0; i < scopes.locals.length; i += 2) {
                const name = scopes.locals[i];
                const value = scopes.locals[i + 1];
                localScopeValues.push({ name: name, value: value });
            }
            this.scopes.push(localScopeValues);
            let memberScope: DebugProtocol.Scope = {
                name: "Members",
                namedVariables: scopes.members.length / 2,
                presentationHint: "locals",
                expensive: false,
                variablesReference: this.scopeId++
            };
            let memberScopeValues: { name: string; value: any }[] = [];
            for (let i = 0; i < scopes.members.length; i += 2) {
                const name = scopes.members[i];
                const value = scopes.members[i + 1];
                memberScopeValues.push({ name: name, value: value });
            }
            this.scopes.push(memberScopeValues);
            let globalScope: DebugProtocol.Scope = {
                name: "Globals",
                namedVariables: scopes.globals.length / 2,
                presentationHint: "locals",
                expensive: false,
                variablesReference: this.scopeId++
            };
            let globalScopeValues: { name: string; value: any }[] = [];
            for (let i = 0; i < scopes.globals.length; i += 2) {
                const name = scopes.globals[i];
                const value = scopes.globals[i + 1];
                globalScopeValues.push({ name: name, value: value });
            }
            this.scopes.push(globalScopeValues);

            response.body = {
                scopes: [localScope, memberScope, globalScope]
            };

            this.sendResponse(response);
        });
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        const path = (args.source.path as string).replace(/\\/g, "/");
        const clientLines = args.lines || [];

        if (fs.existsSync(path)) {
            let bps = this.runtime.getBreakPoints(path);
            let bpLines = bps.map(bp => bp.line);

            bps.forEach(bp => {
                if (clientLines.indexOf(bp.line) === -1) {
                    this.runtime.removeBreakpoint(path, bp.line);
                }
            });
            clientLines.forEach(l => {
                if (bpLines.indexOf(l) === -1) {
                    this.runtime.setBreakPoint(path, l);
                }
            });

            bps = this.runtime.getBreakPoints(path);

            response.body = {
                breakpoints: bps.map(bp => {
                    return new Breakpoint(
                        bp.verified,
                        bp.line,
                        1,
                        new Source(
                            bp.file.split("/").reverse()[0],
                            bp.file,
                            bp.id
                        )
                    );
                })
            };

            this.sendResponse(response);
        }
    }

    protected stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): void {
        if (this.lastFrames) {
            response.body = {
                totalFrames: this.lastFrames.length,
                stackFrames: this.lastFrames.map(sf => {
                    return {
                        id: sf.id,
                        name: sf.function,
                        line: sf.line,
                        column: 1,
                        source: new Source(
                            sf.file,
                            `${this.runtime.getProject()}/${sf.file.replace(
                                "res://",
                                ""
                            )}`
                        )
                    };
                })
            };
        }
        this.sendResponse(response);
    }

    protected stepInRequest(
        response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments
    ) {
        this.runtime.next();
        this.sendResponse(response);
    }

    protected terminateRequest(
        response: DebugProtocol.TerminateResponse,
        args: DebugProtocol.TerminateArguments
    ) {
        this.runtime.terminate();
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [new Thread(GodotDebugSession.THREAD_ID, "thread_1")]
        };
        this.sendResponse(response);
    }
//TODO: Arrays coming up as objects?
    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments,
        request?: DebugProtocol.Request
    ) {
        let scoped = this.scopes[args.variablesReference];
        if (scoped) {
            let output: Variable[] = [];
            scoped.forEach(s => {
                let value: any;
                if (typeof s.value === "number" && !Number.isInteger(s.value)) {
                    value = +Number.parseFloat(noExponents(s.value)).toFixed(4);
                } else if (typeof s.value === "object") {
                    value = JSON.stringify(s.value, undefined, " ").replace(
                        /\n/g,
                        ""
                    ).replace(/\}$/, " }");
                } else {
                    value = s.value;
                }
                let variable: Variable = {
                    name: s.name,
                    value: `${value}`,
                    variablesReference: 0
                };
                output.push(variable);
            });
            response.body = {
                variables: output
            };

            this.sendResponse(response);
        }
    }

    // #endregion Protected Methods (16)
}

function noExponents(value: number): string {
    let data = String(value).split(/[eE]/);
    if (data.length === 1) {
        return data[0];
    }

    let z = "",
        sign = value < 0 ? "-" : "";
    let str = data[0].replace(".", "");
    let mag = Number(data[1]) + 1;

    if (mag < 0) {
        z = sign + "0.";
        while (mag++) {
            z += "0";
        }
        return z + str.replace(/^\-/, "");
    }
    mag -= str.length;
    while (mag--) {
        z += 0;
    }
    return str + z;
}
