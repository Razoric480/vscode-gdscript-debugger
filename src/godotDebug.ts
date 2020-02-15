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
import { VariableScope } from "./VariableScope";

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
    private lastFrames: GodotStackFrame[] = [];
    private runtime: GodotDebugRuntime;
    private scopeId = 1;
    private scopes = new Map<string, VariableScope[]>();

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
        this.runtime.getScope(
            args.frameId,
            (stackLevel, stackFiles, scopes) => {
                let file = stackFiles[stackLevel];
                let fileScopes = this.scopes.get(file);

                let localScope: VariableScope;
                let memberScope: VariableScope;
                let globalScope: VariableScope;

                if (!fileScopes) {
                    fileScopes = [];

                    localScope = new VariableScope(this.scopeId++);
                    memberScope = new VariableScope(this.scopeId++);
                    globalScope = new VariableScope(this.scopeId++);

                    fileScopes.push(localScope);
                    fileScopes.push(memberScope);
                    fileScopes.push(globalScope);

                    this.scopes.set(file, fileScopes);
                } else {
                    localScope = fileScopes[0];
                    memberScope = fileScopes[1];
                    globalScope = fileScopes[2];
                }

                let outLocalScope: DebugProtocol.Scope = {
                    name: "Locals",
                    namedVariables: scopes.locals.length / 2,
                    presentationHint: "locals",
                    expensive: false,
                    variablesReference: localScope.id
                };

                for (let i = 0; i < scopes.locals.length; i += 2) {
                    const name = scopes.locals[i];
                    const value = scopes.locals[i + 1];

                    this.drillScope(localScope, { name: name, value: value });
                }

                let outMemberScope: DebugProtocol.Scope = {
                    name: "Members",
                    namedVariables: scopes.members.length / 2,
                    presentationHint: "locals",
                    expensive: false,
                    variablesReference: memberScope.id
                };

                for (let i = 0; i < scopes.members.length; i += 2) {
                    const name = scopes.members[i];
                    const value = scopes.members[i + 1];

                    this.drillScope(memberScope, { name: name, value: value });
                }

                let outGlobalScope: DebugProtocol.Scope = {
                    name: "Globals",
                    namedVariables: scopes.globals.length / 2,
                    presentationHint: "locals",
                    expensive: false,
                    variablesReference: globalScope.id
                };

                for (let i = 0; i < scopes.globals.length; i += 2) {
                    const name = scopes.globals[i];
                    const value = scopes.globals[i + 1];

                    this.drillScope(globalScope, { name: name, value: value });
                }

                response.body = {
                    scopes: [outLocalScope, outMemberScope, outGlobalScope]
                };

                this.sendResponse(response);
            }
        );
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

    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments,
        request?: DebugProtocol.Request
    ) {
        let outId = args.variablesReference;
        let files = Array.from(this.scopes.keys());
        let isScope = false;
        let outScope: VariableScope | undefined;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            let scopes = this.scopes.get(file);
            if (scopes) {
                let index = scopes.findIndex((s, i) => {
                    return s.id === outId;
                });
                if (index !== -1) {
                    outScope = scopes[index];
                    isScope = true;
                    break;
                } else {
                    for (let l = 0; l < scopes.length; l++) {
                        const scope = scopes[l];
                        let ids = scope.getVariableIds();
                        for (let k = 0; k < ids.length; k++) {
                            const id = ids[k];
                            if (id === outId) {
                                outScope = scope;
                                isScope = false;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (outScope) {
            if (isScope) {
                let varIds = outScope.getVariableIds();
                response.body = {
                    variables: []
                };

                varIds.forEach(id => {
                    let variable = outScope?.getVariable(id);
                    if (variable && variable.name.indexOf(".") === -1) {
                        let refId = 0;
                        let value = "";
                        if (
                            typeof variable.value === "number" &&
                            !Number.isInteger(variable.value)
                        ) {
                            value = String(+Number.parseFloat(
                                noExponents(variable.value)
                            ).toFixed(6));
                        } else if (typeof variable.value === "object") {
                            refId = id;
                            if (variable.value.type) {
                                value = variable.value.type;
                            } else {
                                value = "Object";
                            }
                        } else {
                            if(variable.value) {
                                value = String(variable.value);
                            }
                            else {
                                value = Number.isInteger(variable.value) ? "0" : "null";
                            }
                        }
                        response.body.variables.push({
                            name: variable.name,
                            value: value,
                            variablesReference: refId
                        });
                    }
                });
            } else {
                let variable = outScope.getVariable(outId);
                if (variable) {
                    let subVariables = outScope.getSubVariablesFor(outId);
                    let varRef = 0;
                    if (subVariables) {
                        let ids = outScope.getVariableIds();
                        let pathTo = variable.name;
                        response.body = {
                            variables: []
                        };

                        subVariables.forEach(sv => {
                            let name = sv.name;
                            let idIndex = ids.findIndex(id => {
                                let variable = outScope?.getVariable(id);
                                return (
                                    variable &&
                                    name.indexOf(pathTo) !== -1
                                );
                            });
                            
                            let value = "";
                            let refId = 0;
                            if (
                                typeof sv.value === "number" &&
                                !Number.isInteger(sv.value)
                            ) {
                                value = String(+Number.parseFloat(
                                    noExponents(sv.value)
                                ).toFixed(6));
                            } else if (typeof sv.value === "object") {
                                refId = ids[idIndex];
                                if (sv.value.type) {
                                    value = sv.value.type;
                                } else {
                                    value = "Object";
                                }
                            } else {
                                if(sv.value) {
                                    value = String(sv.value);
                                }
                                else {
                                    value = Number.isInteger(sv.value) ? "0" : "null";
                                }
                            }

                            response.body.variables.push({
                                name: name.replace(/([a-zA-Z_]+?\.)*/g, ""),
                                value: value,
                                variablesReference: refId
                            });
                        });
                    } else {
                        response.body = {
                            variables: [
                                {
                                    name: variable.name.replace(
                                        /([a-zA-Z_]+?\.)*/g,
                                        ""
                                    ),
                                    value:
                                        typeof variable.value === "object"
                                            ? variable.value.type
                                            : variable.value,
                                    variablesReference: 0
                                }
                            ]
                        };
                    }
                } else {
                    response.body = { variables: [] };
                }
            }

            this.sendResponse(response);
        }
    }

    // #endregion Protected Methods (16)

    // #region Private Methods (1)

    private drillScope(scope: VariableScope, variable: any) {
        let id = scope.getIdFor(variable.name);
        if (id === -1) {
            id = this.scopeId++;
        }
        scope.setVariable(variable.name, variable.value, id);
        if (typeof variable.value === "object") {
            for (const property in variable.value) {
                if (property !== "type") {
                    let subVars = scope.getSubVariablesFor(id);
                    let subId = 0;
                    let name = `${variable.name}.${property}`;
                    if (subVars) {
                        subId = subVars?.findIndex((sv, i) => {
                            return name === sv.name;
                        });
                        if (subId === -1) {
                            subId = this.scopeId++;
                        }
                    } else {
                        subId = this.scopeId++;
                    }
                    scope.setSubVariableFor(
                        id,
                        name,
                        variable.value[property],
                        subId
                    );
                    this.drillScope(scope, {
                        name: name,
                        value: variable.value[property]
                    });
                }
            }
        }
    }

    // #endregion Private Methods (1)
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
