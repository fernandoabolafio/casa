import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

import { getGeneration, markGenerationFailed } from "~/lib/generations.server";
import { runGenerationJob } from "~/lib/generate/run-job";

export type GenerateSceneParams = {
  jobId: string;
};

export class GenerateSceneWorkflow extends WorkflowEntrypoint<
  Env,
  GenerateSceneParams
> {
  async run(
    event: WorkflowEvent<GenerateSceneParams>,
    step: WorkflowStep,
  ) {
    const jobId = event.payload.jobId;

    try {
      return await step.do(
        "generate-scene",
        {
          retries: {
            limit: 2,
            delay: "20 seconds",
            backoff: "exponential",
          },
          timeout: "10 minutes",
        },
        async () => {
          const job = await getGeneration(this.env, jobId);
          if (!job) {
            throw new NonRetryableError("Generation job not found.");
          }
          if (job.status === "done" && job.resultImageId) {
            return { resultImageId: job.resultImageId };
          }
          return await runGenerationJob(this.env, jobId);
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Generation failed.";
      await step.do("mark-failed", async () => {
        const job = await getGeneration(this.env, jobId);
        if (!job || job.status === "done") {
          return { skipped: true };
        }
        await markGenerationFailed({
          env: this.env,
          jobId,
          error: message,
        });
        return { skipped: false };
      });
      throw error;
    }
  }
}
