import { Alert, AlertDescription, AlertTitle } from "@openai-demo/ui/components/alert";
import { Badge } from "@openai-demo/ui/components/badge";
import { Button } from "@openai-demo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openai-demo/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@openai-demo/ui/components/chart";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@openai-demo/ui/components/field";
import { ScrollArea } from "@openai-demo/ui/components/scroll-area";
import { Skeleton } from "@openai-demo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@openai-demo/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@openai-demo/ui/components/tabs";
import { Textarea } from "@openai-demo/ui/components/textarea";
import { cn } from "@openai-demo/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ActivityIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  FileSearchIcon,
  LoaderCircleIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalSquareIcon,
} from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  type AgentStepName,
  type AgentStepStatus,
  type CopilotRunEvent,
  type CopilotRunResponse,
  runCopilotStream,
} from "@/lib/copilot-api";

export const Route = createFileRoute("/")({
  component: CopilotWorkbench,
});

const defaultQuestion = "What were the top GCP services by cloud spend in August 2024?";
const exampleQuestions = [
  "What were the top GCP services by cloud spend in August 2024?",
  "Which regions had the highest cloud spend in August 2024?",
  "Which services had the highest average CPU utilization and cloud spend?",
  "Drop any billing tables we do not need and then tell me the top services by cloud spend.",
];

const workflowSteps: Array<{
  name: AgentStepName;
  label: string;
  icon: typeof SparklesIcon;
}> = [
  { name: "coordinator", label: "Coordinator", icon: SparklesIcon },
  { name: "metric_catalog", label: "RAG", icon: FileSearchIcon },
  { name: "schema_lookup", label: "Schema", icon: DatabaseIcon },
  { name: "sql_analyst", label: "SQL", icon: TerminalSquareIcon },
  { name: "sql_safety", label: "Safety", icon: ShieldCheckIcon },
  { name: "sandbox_validation", label: "Sandbox", icon: ActivityIcon },
  { name: "databricks_execution", label: "Databricks", icon: DatabaseIcon },
  { name: "narrative", label: "Narrative", icon: SparklesIcon },
];

const chartConfig = {
  spend: {
    label: "Cloud spend",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function CopilotWorkbench() {
  const [question, setQuestion] = React.useState(defaultQuestion);
  const [events, setEvents] = React.useState<CopilotRunEvent[]>([]);
  const [response, setResponse] = React.useState<CopilotRunResponse>();
  const [runId, setRunId] = React.useState("");

  const runMutation = useMutation({
    mutationFn: async (nextQuestion: string) =>
      runCopilotStream({
        question: nextQuestion,
        onStarted: setRunId,
        onEvent: (event) => {
          setEvents((currentEvents) => [...currentEvents, event]);
        },
      }),
    onMutate: () => {
      setResponse(undefined);
      setEvents([]);
      setRunId("");
    },
    onSuccess: (nextResponse) => {
      setResponse(nextResponse);
      setEvents(nextResponse.events);
      setRunId(nextResponse.runId);
    },
  });

  const result = response?.result;
  const rows = result?.rows ?? [];
  const chartData = React.useMemo(() => toChartData(rows), [rows]);
  const completedSteps = workflowSteps.filter(
    (step) => stepStatus(step.name, events) === "completed",
  );

  return (
    <main className="min-h-0 overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Databricks</Badge>
              <Badge variant="secondary">Agent workflow</Badge>
            </div>
            <h1 className="text-xl font-medium">Cloud Cost Metrics Copilot</h1>
            <p className="max-w-3xl text-xs/relaxed text-muted-foreground">
              Ask a billing question and inspect the agent steps, generated SQL, sandbox validation,
              Databricks rows, and RAG citations.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 md:min-w-80">
            <MetricTile label="Steps" value={`${completedSteps.length}/${workflowSteps.length}`} />
            <MetricTile label="Rows" value={String(rows.length)} />
            <MetricTile label="Citations" value={String(result?.citations.length ?? 0)} />
          </div>
        </header>

        <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="flex min-h-0 flex-col gap-4">
            <QuestionCard
              question={question}
              isPending={runMutation.isPending}
              onQuestionChange={setQuestion}
              onSubmit={() => runMutation.mutate(question)}
            />
            <ExampleQuestionList
              activeQuestion={question}
              disabled={runMutation.isPending}
              onPick={(nextQuestion) => {
                setQuestion(nextQuestion);
                runMutation.mutate(nextQuestion);
              }}
            />
            <WorkflowTimeline events={events} isPending={runMutation.isPending} />
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            {runMutation.error ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Copilot run failed</AlertTitle>
                <AlertDescription>{runMutation.error.message}</AlertDescription>
              </Alert>
            ) : null}

            <ResultSummary result={result} isPending={runMutation.isPending} runId={runId} />

            <Tabs defaultValue="results" className="min-h-0">
              <TabsList variant="line">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="sql">SQL</TabsTrigger>
                <TabsTrigger value="citations">Citations</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
              </TabsList>
              <TabsContent value="results" className="min-h-0">
                <section className="grid gap-4 lg:grid-cols-[minmax(300px,0.9fr)_1.1fr]">
                  <SpendChart data={chartData} isPending={runMutation.isPending} />
                  <RowsTable rows={rows} isPending={runMutation.isPending} />
                </section>
              </TabsContent>
              <TabsContent value="sql">
                <SqlPanel sql={result?.sql} isPending={runMutation.isPending} />
              </TabsContent>
              <TabsContent value="citations">
                <CitationPanel
                  citations={result?.citations ?? []}
                  isPending={runMutation.isPending}
                />
              </TabsContent>
              <TabsContent value="events">
                <EventPanel events={events} />
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </div>
    </main>
  );
}

function QuestionCard({
  question,
  isPending,
  onQuestionChange,
  onSubmit,
}: {
  question: string;
  isPending: boolean;
  onQuestionChange: (question: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask</CardTitle>
        <CardDescription>
          Cloud billing questions run through RAG, SQL, safety, sandbox, and Databricks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="copilot-question">Question</FieldLabel>
              <Textarea
                id="copilot-question"
                value={question}
                disabled={isPending}
                rows={4}
                onChange={(event) => onQuestionChange(event.target.value)}
              />
              <FieldDescription>
                The backend decides mock or live mode from server environment settings.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={isPending || question.trim().length === 0}>
            {isPending ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            Run workflow
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ExampleQuestionList({
  activeQuestion,
  disabled,
  onPick,
}: {
  activeQuestion: string;
  disabled: boolean;
  onPick: (question: string) => void;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Questions</CardTitle>
        <CardDescription>
          Ready checks for spend, region, utilization, and SQL safety.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {exampleQuestions.map((question) => (
          <Button
            key={question}
            type="button"
            variant={activeQuestion === question ? "secondary" : "outline"}
            disabled={disabled}
            className="h-auto justify-start whitespace-normal py-2 text-left"
            onClick={() => onPick(question)}
          >
            {question}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function WorkflowTimeline({
  events,
  isPending,
}: {
  events: CopilotRunEvent[];
  isPending: boolean;
}) {
  return (
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle>Workflow</CardTitle>
        <CardDescription>Specialist agent timeline</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {workflowSteps.map((step) => {
            const status = stepStatus(step.name, events);
            const message = stepMessage(step.name, events);
            const Icon = step.icon;

            return (
              <div
                key={step.name}
                className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-none border p-2"
              >
                <Icon className="mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-medium">{step.label}</p>
                    {isPending && status === "running" ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-xs/relaxed text-muted-foreground">
                    {message ?? "Waiting for run event."}
                  </p>
                </div>
                <StatusBadge status={status} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultSummary({
  result,
  isPending,
  runId,
}: {
  result?: CopilotRunResponse["result"];
  isPending: boolean;
  runId: string;
}) {
  if (isPending && !result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Answer</CardTitle>
          <CardDescription>{runId ? `Run ${runId}` : "Run starting"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Answer</CardTitle>
        <CardDescription>{runId ? `Run ${runId}` : "No run yet"}</CardDescription>
        <CardAction>
          {result ? (
            <Badge variant="secondary">Complete</Badge>
          ) : (
            <Badge variant="outline">Idle</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm/relaxed">
          {result?.answer ?? "Run a question to generate an answer."}
        </p>
      </CardContent>
    </Card>
  );
}

function SpendChart({
  data,
  isPending,
}: {
  data: Array<{ label: string; spend: number }>;
  isPending: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spend</CardTitle>
        <CardDescription>Top returned rows by cloud spend</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="aspect-video w-full" />
        ) : data.length > 0 ? (
          <ChartContainer config={chartConfig} className="aspect-[16/9]">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" dataKey="spend" tickFormatter={formatCompactCurrency} />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => String(value).slice(0, 16)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="spend" fill="var(--color-spend)" radius={0} />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyPanel label="No chart data returned." />
        )}
      </CardContent>
    </Card>
  );
}

function RowsTable({ rows, isPending }: { rows: Record<string, unknown>[]; isPending: boolean }) {
  const columns = React.useMemo(
    () => [...new Set(rows.flatMap((row) => Object.keys(row)))],
    [rows],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rows</CardTitle>
        <CardDescription>Databricks result preview</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-5/6" />
          </div>
        ) : rows.length > 0 ? (
          <ScrollArea className="h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${index}-${JSON.stringify(row)}`}>
                    {columns.map((column) => (
                      <TableCell key={column}>{formatCell(row[column])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <EmptyPanel label="No rows returned." />
        )}
      </CardContent>
    </Card>
  );
}

function SqlPanel({ sql, isPending }: { sql?: string; isPending: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>SQL</CardTitle>
        <CardDescription>Generated Databricks query</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && !sql ? (
          <Skeleton className="h-52 w-full" />
        ) : sql ? (
          <ScrollArea className="h-96 rounded-none border bg-muted/30">
            <pre className="p-3 text-xs/relaxed">
              <code>{sql.trim()}</code>
            </pre>
          </ScrollArea>
        ) : (
          <EmptyPanel label="No SQL generated." />
        )}
      </CardContent>
    </Card>
  );
}

function CitationPanel({
  citations,
  isPending,
}: {
  citations: NonNullable<CopilotRunResponse["result"]>["citations"];
  isPending: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Citations</CardTitle>
        <CardDescription>Retrieved knowledge context</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && citations.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-5/6" />
          </div>
        ) : citations.length > 0 ? (
          <div className="flex flex-col gap-3">
            {citations.map((citation) => (
              <div
                key={`${citation.title}-${citation.sourcePath}`}
                className="flex flex-col gap-2 border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{citation.title}</p>
                  {citation.sourcePath ? (
                    <Badge variant="outline">{citation.sourcePath}</Badge>
                  ) : null}
                </div>
                <p className="text-xs/relaxed text-muted-foreground">{citation.excerpt}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel label="No citations returned." />
        )}
      </CardContent>
    </Card>
  );
}

function EventPanel({ events }: { events: CopilotRunEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Events</CardTitle>
        <CardDescription>Raw streamed workflow events</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <ScrollArea className="h-96 rounded-none border bg-muted/30">
            <pre className="p-3 text-xs/relaxed">
              <code>{JSON.stringify(events, null, 2)}</code>
            </pre>
          </ScrollArea>
        ) : (
          <EmptyPanel label="No events streamed." />
        )}
      </CardContent>
    </Card>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border bg-card p-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-medium">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AgentStepStatus | "idle" }) {
  const icon =
    status === "completed" ? (
      <CheckCircle2Icon data-icon="inline-start" />
    ) : status === "running" ? (
      <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
    ) : null;

  return (
    <Badge
      variant={
        status === "failed" ? "destructive" : status === "completed" ? "secondary" : "outline"
      }
      className={cn(status === "running" && "text-foreground")}
    >
      {icon}
      {status}
    </Badge>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center border bg-muted/20 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function stepStatus(step: AgentStepName, events: CopilotRunEvent[]): AgentStepStatus | "idle" {
  return [...events].reverse().find((event) => event.step === step)?.status ?? "idle";
}

function stepMessage(step: AgentStepName, events: CopilotRunEvent[]): string | undefined {
  return [...events].reverse().find((event) => event.step === step)?.message;
}

function toChartData(rows: Record<string, unknown>[]): Array<{ label: string; spend: number }> {
  return rows
    .map((row) => ({
      label: String(row.service_name ?? row.region_zone ?? row.resource_id ?? "row"),
      spend: Number(row.cloud_spend_usd ?? row.rounded_cost_usd ?? 0),
    }))
    .filter((row) => Number.isFinite(row.spend) && row.spend > 0)
    .slice(0, 8);
}

function formatCompactCurrency(value: number | string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value));
}

function formatCell(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}
