"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertTriangle, Clock } from "lucide-react"
import React from "react"

interface Props {
  plan: string
  isLoading: boolean
}

export function PlanOutput({ plan, isLoading }: Props) {
  if (isLoading) return null
  if (!plan) return null

  return (
    <div className="w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-xl font-bold text-[#f1f5f9] mt-6 mb-4" {...props} />
          ),
          h2: ({ node, ...props }) => {
            const text = extractText(props.children)
            const isRisks = text.toUpperCase().includes("RIESGO")
            return (
              <h2
                className={`mt-8 mb-4 pb-2 border-b border-[#1a2035] text-[11px] uppercase tracking-wider font-bold flex items-center gap-2 ${
                  isRisks ? "text-orange-500" : "text-blue-400"
                }`}
              >
                {isRisks && <AlertTriangle className="size-3.5" />}
                {props.children}
              </h2>
            )
          },
          h3: ({ node, ...props }) => {
            const text = extractText(props.children)
            const isRisks = text.toUpperCase().includes("RIESGO")
            return (
              <h3
                className={`mt-8 mb-4 pb-2 border-b border-[#1a2035] text-[11px] uppercase tracking-wider font-bold flex items-center gap-2 ${
                  isRisks ? "text-orange-500" : "text-blue-400"
                }`}
              >
                {isRisks && <AlertTriangle className="size-3.5" />}
                {props.children}
              </h3>
            )
          },
          p: ({ node, ...props }) => {
            const text = extractText(props.children).toUpperCase()
            if (text.includes("TOTAL") && (text.includes("HORA") || text.includes("ESTIMAD"))) {
              return (
                <div className="mt-6 p-4 rounded-lg bg-[#0f1e3a] border border-blue-700 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-2 text-blue-100 font-medium">
                    <Clock className="size-4 text-blue-400" />
                    <span>Total Estimado</span>
                  </div>
                  <div className="text-blue-300 font-bold text-lg">{props.children}</div>
                </div>
              )
            }
            return <p className="mb-4 text-sm text-[#94a3b8] leading-relaxed" {...props} />
          },
          ul: ({ node, ...props }) => (
            <ul className="space-y-3 mb-6 list-none pl-0" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="space-y-3 mb-6 list-none pl-0" {...props} />
          ),
          li: (rawProps: React.ComponentProps<"li"> & { ordered?: boolean; node?: unknown }) => {
            const { ordered, children, node: _node, ...props } = rawProps
            return (
              <li className="relative p-4 rounded-xl bg-[#131924] border border-[#1e2330] text-sm text-[#cbd5e1] leading-relax hover:border-[#2d3748] transition-colors" {...props}>
                {ordered && (
                  <div className="absolute -left-2.5 -top-2.5 bg-[#0f1e3a] text-blue-400 text-[10px] font-bold size-6 flex items-center justify-center rounded-full border border-blue-500/30 shadow-sm">
                    <span className="step-number" />
                  </div>
                )}
                <div className={ordered ? "pl-2" : ""}>{children}</div>
              </li>
            )
          },
          strong: ({ node, ...props }) => {
            const text = extractText(props.children)
            if (text.match(/\b\d+(\.\d+)?\s*(h|horas?|hrs?)\b/i)) {
              return (
                <strong
                  className="font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20"
                  {...props}
                />
              )
            }
            return <strong className="font-semibold text-[#f1f5f9]" {...props} />
          },
          a: ({ node, ...props }) => (
            <a className="text-blue-400 hover:underline" {...props} />
          ),
          code: ({ node, ...props }) => (
            <code
              className="text-[12px] bg-[#0d1017] px-1.5 py-0.5 rounded text-blue-300 font-mono"
              {...props}
            />
          ),
        }}
      >
        {plan}
      </ReactMarkdown>
      <style dangerouslySetInnerHTML={{ __html: `
        ol {
          counter-reset: step;
        }
        ol > li {
          counter-increment: step;
        }
        ol > li > div:first-child .step-number::before {
          content: counter(step);
        }
      `}} />
    </div>
  )
}

function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children
  if (typeof children === "number") return children.toString()
  if (Array.isArray(children)) return children.map(extractText).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(children))
    return extractText(children.props.children)
  return ""
}