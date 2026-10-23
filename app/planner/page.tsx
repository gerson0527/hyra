import { PlannerForm } from "@/components/planner/PlannerForm"

export const metadata = {
  title: "Planner — Hyra",
}

export default function PlannerPage() {
  return (
    <div className="flex h-[calc(100vh-36px)] w-full overflow-hidden bg-[#0d1017]">
      <PlannerForm />
    </div>
  )
}
