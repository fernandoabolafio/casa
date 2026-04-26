"use client";

type InstructionQueueProps = {
  instructions: string[];
  onAddInstruction: (instruction: string) => void;
  onRemoveInstruction: (index: number) => void;
  onClearInstructions: () => void;
};

export function InstructionQueue({
  instructions,
  onAddInstruction,
  onRemoveInstruction,
  onClearInstructions,
}: InstructionQueueProps) {
  return (
    <section className="card">
      <div>
        <h3>Instruction queue</h3>
        <p className="small muted">
          Add refinements, then submit them together with the brushed mask.
        </p>
      </div>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const instruction = String(form.get("instruction") ?? "").trim();

          if (instruction) {
            onAddInstruction(instruction);
            event.currentTarget.reset();
          }
        }}
      >
        <input
          name="instruction"
          placeholder="Paint this wall warm red, try a smaller sofa..."
          type="text"
        />
        <button className="button" type="submit">
          Add instruction
        </button>
      </form>

      {instructions.length > 0 ? (
        <div className="queue">
          {instructions.map((instruction, index) => (
            <div className="queue-item" key={`${instruction}-${index}`}>
              <span className="small">{instruction}</span>
              <button
                aria-label={`Remove instruction ${index + 1}`}
                className="button danger"
                type="button"
                onClick={() => onRemoveInstruction(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="small muted">No queued refinements yet.</p>
      )}

      <button
        className="button danger"
        disabled={instructions.length === 0}
        type="button"
        onClick={onClearInstructions}
      >
        Clear queue
      </button>
    </section>
  );
}
