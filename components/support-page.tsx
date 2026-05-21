"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Send,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCopyLocale, getHtmlLang, useLocale, type CopyLocale } from "@/lib/locale";

const supportCopy: Record<
  CopyLocale,
  {
    brand: string;
    back: string;
    badge: string;
    title: string;
    subtitle: string;
    responseTitle: string;
    responseText: string;
    secureTitle: string;
    secureText: string;
    contextTitle: string;
    contextText: string;
    formTitle: string;
    formSubtitle: string;
    type: string;
    priority: string;
    name: string;
    email: string;
    workspace: string;
    subject: string;
    description: string;
    descriptionPlaceholder: string;
    submit: string;
    submittedTitle: string;
    submittedText: string;
    submitAnother: string;
    types: string[];
    priorities: string[];
    quickTitle: string;
    quickItems: { title: string; text: string }[];
  }
> = {
  en: {
    brand: "Monarca AI",
    back: "Back to workspace",
    badge: "Support",
    title: "Contact support",
    subtitle: "Submit a support ticket for data connection, reports, billing, or workspace issues",
    responseTitle: "Response time",
    responseText: "Most tickets receive a reply within one business day",
    secureTitle: "Workspace safe",
    secureText: "Do not include passwords, private keys, or raw customer data",
    contextTitle: "Add context",
    contextText: "Screenshots, workspace name, and steps to reproduce help us resolve faster",
    formTitle: "Submit a ticket",
    formSubtitle: "Tell us what happened and what you expected",
    type: "Issue type",
    priority: "Priority",
    name: "Name",
    email: "Work email",
    workspace: "Workspace",
    subject: "Subject",
    description: "Description",
    descriptionPlaceholder: "Describe the issue, affected page, expected result, and steps to reproduce",
    submit: "Submit ticket",
    submittedTitle: "Ticket submitted",
    submittedText: "Support will follow up by email after reviewing your workspace context",
    submitAnother: "Submit another ticket",
    types: ["Data connection", "Report generation", "Billing and plan", "Account access", "Other"],
    priorities: ["Normal", "High", "Urgent"],
    quickTitle: "Common support areas",
    quickItems: [
      { title: "Data sources", text: "Database, warehouse, CSV, and third-party connectors" },
      { title: "AI reports", text: "Briefing generation, reasoning output, and missing insights" },
      { title: "Billing", text: "Plans, invoices, upgrades, and enterprise consultation" }
    ]
  },
  zh: {
    brand: "蝴蝶效应",
    back: "返回工作台",
    badge: "客服支持",
    title: "提交客服工单",
    subtitle: "遇到数据连接、报告生成、套餐付费或账号问题，可以在这里联系支持团队",
    responseTitle: "响应时间",
    responseText: "多数工单会在 1 个工作日内回复",
    secureTitle: "安全提示",
    secureText: "请勿填写密码、私钥或原始客户数据",
    contextTitle: "补充上下文",
    contextText: "截图、工作区名称和复现步骤可以帮助我们更快定位问题",
    formTitle: "创建工单",
    formSubtitle: "描述你遇到的问题和期望结果",
    type: "问题类型",
    priority: "优先级",
    name: "姓名",
    email: "工作邮箱",
    workspace: "工作区",
    subject: "标题",
    description: "问题描述",
    descriptionPlaceholder: "描述问题、发生页面、期望结果和复现步骤",
    submit: "提交工单",
    submittedTitle: "工单已提交",
    submittedText: "支持团队会查看工作区上下文，并通过邮箱继续跟进",
    submitAnother: "继续提交",
    types: ["数据连接", "报告生成", "套餐与付费", "账号权限", "其他问题"],
    priorities: ["普通", "较急", "紧急"],
    quickTitle: "常见支持范围",
    quickItems: [
      { title: "数据源", text: "数据库、数仓、CSV 和第三方连接器" },
      { title: "AI 报告", text: "简报生成、推理结果和缺失洞察" },
      { title: "付费", text: "套餐、发票、升级和企业咨询" }
    ]
  }
};

export function SupportPage() {
  const [locale, , isLocaleReady] = useLocale("en");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const copy = supportCopy[getCopyLocale(locale)];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitted(true);
  };

  if (!isLocaleReady) {
    return <main className="min-h-screen bg-background" />;
  }

  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,#ffffff,#f8fafc)] px-4 py-5 text-slate-950 sm:px-6 lg:px-8"
      lang={getHtmlLang(locale)}
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard/reports" className="flex items-center gap-3">
            <BrandLogo label={copy.brand} className="h-11" />
            <span>
              <span className="block text-xs text-muted-foreground">{copy.badge}</span>
            </span>
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/reports">
              <ArrowLeft className="size-4" />
              {copy.back}
            </Link>
          </Button>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-5">
            <div className="rounded-3xl border border-emerald-100 bg-white/72 p-7 shadow-sm sm:p-8">
              <Badge className="mb-4 border-emerald-700/20 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                {copy.badge}
              </Badge>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                {copy.title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                {copy.subtitle}
              </p>
            </div>

            <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-sm">
              <CardHeader className="border-b bg-white px-5 py-4">
                <CardTitle>{copy.formTitle}</CardTitle>
                <p className="text-sm text-muted-foreground">{copy.formSubtitle}</p>
              </CardHeader>
              <CardContent className="p-5">
                {isSubmitted ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
                    <div className="mb-4 grid size-11 place-items-center rounded-full bg-white text-emerald-800">
                      <CheckCircle2 className="size-5" />
                    </div>
                    <h2 className="text-xl font-semibold">{copy.submittedTitle}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.submittedText}</p>
                    <Button className="mt-5 rounded-full" onClick={() => setIsSubmitted(false)}>
                      {copy.submitAnother}
                    </Button>
                  </div>
                ) : (
                  <form className="grid gap-4" onSubmit={handleSubmit}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium">
                        {copy.type}
                        <select className="h-10 rounded-md border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {copy.types.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        {copy.priority}
                        <select className="h-10 rounded-md border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {copy.priorities.map((priority) => (
                            <option key={priority}>{priority}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium">
                        {copy.name}
                        <Input placeholder="Amy" />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        {copy.email}
                        <Input type="email" placeholder="amy@example.com" />
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium">
                        {copy.workspace}
                        <Input placeholder={copy.brand} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        {copy.subject}
                        <Input />
                      </label>
                    </div>

                    <label className="grid gap-2 text-sm font-medium">
                      {copy.description}
                      <textarea
                        className="min-h-36 rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder={copy.descriptionPlaceholder}
                      />
                    </label>

                    <Button className="mt-2 w-fit rounded-full px-5">
                      <Send className="size-4" />
                      {copy.submit}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-5">
            <div className="grid gap-3">
              {[
                { icon: Clock3, title: copy.responseTitle, text: copy.responseText },
                { icon: ShieldCheck, title: copy.secureTitle, text: copy.secureText },
                { icon: MessageSquareText, title: copy.contextTitle, text: copy.contextText }
              ].map((item) => (
                <Card key={item.title} className="border-slate-200/80 bg-white/84 shadow-sm">
                  <CardContent className="flex gap-3 p-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
                      <item.icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-slate-200/80 bg-white/84 shadow-sm">
              <CardHeader className="px-5 py-4">
                <CardTitle className="text-base">{copy.quickTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                {copy.quickItems.map((item) => (
                  <div key={item.title} className="rounded-xl border bg-background p-4">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  );
}
