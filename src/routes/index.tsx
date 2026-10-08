import { createFileRoute } from "@tanstack/react-router";
import { NeuronBench } from "@/components/neuron-bench";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <NeuronBench />;
}
