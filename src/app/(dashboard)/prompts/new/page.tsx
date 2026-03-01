// app/(dashboard)/prompts/new/page.tsx
import { NewPromptForm } from "@/components/prompts/NewPromptForm";

export default function NewPromptPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">New Prompt Template</h1>
        <p className="mt-1 text-sm text-gray-400">
          Create a named template. Add versioned content in the next step.
        </p>
      </div>
      <NewPromptForm />
    </div>
  );
}
