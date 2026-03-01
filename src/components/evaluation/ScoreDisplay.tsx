interface ScoreDisplayProps {
  score: number;
  label?: string;
  size?: "sm" | "md";
}

const scoreColor = (score: number): string => {
  if (score >= 4) return "bg-green-100 text-green-800";
  if (score >= 3) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
};

export function ScoreDisplay({ score, label, size = "md" }: ScoreDisplayProps) {
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${textSize} ${scoreColor(score)}`}
    >
      {label && <span className="text-muted-foreground">{label}:</span>}
      {score.toFixed(1)}
    </span>
  );
}
