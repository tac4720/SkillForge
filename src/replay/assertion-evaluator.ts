export type Assertion =
  | { type: "urlMatches"; value: string }
  | { type: "textContains"; locator: string; value: string }
  | { type: "fileExists"; path: string }
  | { type: "exitCode"; value: number }
  | { type: "stdoutRegex"; value: string };

export interface AssertionContext {
  currentUrl?: string;
  textByLocator?: Record<string, string>;
  existingFiles?: Set<string>;
  exitCode?: number;
  stdout?: string;
}

export interface AssertionFailure {
  assertion: Assertion;
  reason: string;
}

export interface AssertionResult {
  pass: boolean;
  failures: AssertionFailure[];
}

function evaluateAssertion(assertion: Assertion, context: AssertionContext): AssertionFailure | null {
  switch (assertion.type) {
    case "urlMatches": {
      const url = context.currentUrl ?? "";
      return new RegExp(assertion.value, "u").test(url)
        ? null
        : { assertion, reason: `URL did not match ${assertion.value}.` };
    }
    case "textContains": {
      const text = context.textByLocator?.[assertion.locator] ?? "";
      return text.includes(assertion.value)
        ? null
        : { assertion, reason: `Text at ${assertion.locator} did not contain ${assertion.value}.` };
    }
    case "fileExists": {
      return context.existingFiles?.has(assertion.path)
        ? null
        : { assertion, reason: `File did not exist: ${assertion.path}.` };
    }
    case "exitCode": {
      return context.exitCode === assertion.value
        ? null
        : { assertion, reason: `Exit code ${context.exitCode ?? "undefined"} did not match ${assertion.value}.` };
    }
    case "stdoutRegex": {
      const stdout = context.stdout ?? "";
      return new RegExp(assertion.value, "u").test(stdout)
        ? null
        : { assertion, reason: `stdout did not match ${assertion.value}.` };
    }
  }
}

export function evaluateAssertions(assertions: Assertion[], context: AssertionContext): AssertionResult {
  const failures = assertions
    .map((assertion) => evaluateAssertion(assertion, context))
    .filter((failure): failure is AssertionFailure => failure !== null);

  return {
    pass: failures.length === 0,
    failures
  };
}
