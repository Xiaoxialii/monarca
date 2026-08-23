import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Monarca",
  description:
    "Privacy Policy for Monarca, an AI-powered overseas ecommerce operations platform."
};

const sections = [
  {
    title: "Introduction",
    content: [
      "This Privacy Policy explains how Monarca collects, uses, shares, and protects information when people visit our website, submit a partnership application, create an account or workspace, connect ecommerce or advertising platforms, upload files, or use Monarca's AI-powered overseas ecommerce operations services.",
      "Monarca helps ecommerce teams and potential partners analyze store, product, advertising, inventory, cost, conversion, and profit data in order to evaluate opportunities, generate operating plans, and support authorized execution across channels."
    ]
  },
  {
    title: "Information We Collect",
    content: [
      "Partnership application information: When you apply to work with Monarca, we may collect your name, email, WeChat ID, business stage, store or product links, sales channels, fulfillment capability, requested services, product descriptions, business needs, and your consent to be contacted.",
      "Account and workspace information: If you create an account or workspace, we may collect account identifiers, email address, username, workspace name, role, membership status, invitation information, locale preference, subscription or entitlement status, and related workspace settings.",
      "Store and product information: If you connect or provide store data, we may process product names, SKUs, variants, prices, categories, tags, listing information, product pages, images or image references, inventory status, channel availability, and related metadata.",
      "Ecommerce order, product, inventory, and cost data: When authorized by you, Monarca may process order, refund, customer country or market information, product performance, inventory movement, fulfillment status, cost inputs, gross revenue, discounts, shipping, taxes, fees, and other data needed to calculate operational and profit metrics.",
      "Advertising data: When you connect advertising platforms, Monarca may process campaigns, ad groups, ads, spend, clicks, impressions, conversions, attributed conversion value, ROAS, budgets, targeting metadata, and performance history.",
      "Files and information voluntarily uploaded by users: You may upload spreadsheets, CSV files, exports, product data, cost data, business notes, or other materials. Monarca processes those files to provide the requested analysis and service functionality.",
      "Device, browser, IP address, usage logs, and cookies: When the product or website collects this information, we may process device type, browser type, IP address, approximate location derived from IP address, pages visited, session events, error logs, security logs, and cookies or similar technologies for authentication, security, product reliability, analytics, and user-facing functionality."
    ]
  },
  {
    title: "How We Use Information",
    content: [
      "Evaluate partnership applications and determine whether Monarca may be a fit for the applicant's products, store, supply chain, and overseas growth needs.",
      "Contact applicants by email or WeChat about their application, business needs, and possible cooperation with Monarca.",
      "Provide, maintain, troubleshoot, and improve the Monarca service, including account, workspace, dashboard, reporting, data connection, and operational planning features.",
      "Connect and synchronize ecommerce and advertising data after a user authorizes an integration.",
      "Calculate SKU-level revenue, costs, advertising spend, contribution margin, gross profit, net profit, and other operational metrics.",
      "Generate diagnoses, forecasts, simulations, scenario comparisons, operating recommendations, and execution plans related to SKUs, ads, creators, inventory, pricing, channels, revenue, and profit.",
      "Execute authorized operating actions only when those actions are approved, configured, or otherwise authorized by the user or the user's workspace.",
      "Provide support, security monitoring, fraud prevention, abuse prevention, auditability, and product reliability improvements.",
      "Improve user-facing functionality, including dashboards, reports, data mapping, data quality checks, recommendation workflows, and connected platform experiences."
    ]
  },
  {
    title: "Connected Third-Party Platforms",
    content: [
      "Monarca may allow users to connect third-party platforms such as Shopify, Amazon, Google Ads, and other ecommerce, advertising, analytics, fulfillment, finance, or operating platforms expressly connected by the user.",
      "Monarca only accesses connected account data after the user grants authorization through the relevant platform, OAuth flow, API key mechanism, file upload, or another authorized connection method supported by the product.",
      "Users can disconnect integrations through the relevant Monarca workspace settings or, where applicable, through the connected platform's own app, OAuth, or permissions settings.",
      "The partnership application form is not a credential collection form. Monarca does not request store passwords, Access Tokens, API keys, or login credentials through the partnership application form."
    ]
  },
  {
    title: "Google API Data",
    content: [
      "If you connect Google Ads or another Google service supported by Monarca, Monarca may access Google API data only after you authorize the connection. The data may include advertising account, campaign, ad group, ad, spend, click, impression, conversion, and attributed conversion value data needed to provide Monarca's analytics, forecasting, reporting, and operations features.",
      "Monarca uses Google API data to provide the user-requested Monarca service, including advertising performance analysis, SKU-level profitability calculations, budget simulation, operating recommendations, and authorized operations workflows.",
      "Monarca does not sell Google user data. Monarca does not use Google user data for unrelated advertising, data brokerage, or credit evaluation. Monarca does not use Google user data to train general AI models unrelated to providing the user's Monarca service.",
      "Monarca's use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements."
    ],
    link: {
      label: "Google API Services User Data Policy",
      href: "https://developers.google.com/terms/api-services-user-data-policy"
    }
  },
  {
    title: "AI and Automated Processing",
    content: [
      "Monarca may use algorithms, simulations, machine learning, and AI systems to analyze ecommerce, advertising, inventory, cost, conversion, and profit data. These systems may generate diagnoses, forecasts, simulations, operating plans, recommended budgets, inventory suggestions, creator marketing suggestions, channel recommendations, and related outputs.",
      "Predictions, simulations, recommendations, and projected profit lift are estimates based on available data and assumptions. They do not guarantee specific revenue, sales, margin, or profit results.",
      "Execution is limited to actions approved, configured, or otherwise authorized by the user or the user's workspace. Monarca is designed to support operating decisions; users remain responsible for reviewing sensitive actions, business assumptions, legal obligations, and commercial risks."
    ]
  },
  {
    title: "How We Share Information",
    content: [
      "Infrastructure and service providers: Monarca may share information with service providers that help us host, secure, store, process, monitor, email, support, or operate the product.",
      "Platforms connected by the user: Monarca may send or receive data from Shopify, Amazon, Google Ads, and other platforms that the user expressly connects or authorizes.",
      "Authorized operating partners: If a user authorizes Monarca to support operational execution, Monarca may share necessary operational information with authorized partners or service providers involved in ecommerce operations, marketing, fulfillment, support, or related execution.",
      "Professional advisers: Monarca may share limited information with lawyers, accountants, auditors, insurers, or other professional advisers where reasonably necessary.",
      "Legal and regulatory requirements: Monarca may disclose information when required by law, legal process, regulation, government request, or to protect rights, safety, security, and integrity.",
      "Business transfers: If Monarca is involved in a merger, acquisition, financing, reorganization, sale of assets, or similar transaction, information may be transferred as part of that transaction subject to appropriate safeguards.",
      "Monarca does not sell personal information or connected store and advertising data."
    ]
  },
  {
    title: "Data Retention",
    content: [
      "Monarca retains information for as long as reasonably necessary to provide the service, evaluate applications, maintain accounts and workspaces, support connected integrations, comply with legal obligations, resolve disputes, enforce agreements, prevent abuse, and maintain business records.",
      "Retention periods may vary based on the type of data, the user's workspace settings, the status of the relationship with Monarca, legal requirements, security needs, and whether the data is needed for auditability or service continuity. Users may request deletion of certain information as described in the Privacy Rights and Choices section."
    ]
  },
  {
    title: "Data Security",
    content: [
      "Monarca uses administrative, technical, and organizational measures designed to protect information against unauthorized access, loss, misuse, alteration, and disclosure. These measures may include access controls, authentication, encrypted connections where supported, logging, role-based permissions, and operational security practices.",
      "No online service, database, transmission method, or storage system can be guaranteed to be completely secure. Users should avoid submitting store passwords, third-party platform passwords, Access Tokens, API keys, or other credentials through forms that do not expressly request them."
    ]
  },
  {
    title: "International Data Transfers",
    content: [
      "Monarca may process information in countries other than the country where the user or applicant is located. Data protection laws may differ between jurisdictions. When information is transferred internationally, Monarca uses reasonable safeguards appropriate to the nature of the service and the information involved."
    ]
  },
  {
    title: "Privacy Rights and Choices",
    content: [
      "Access: You may request access to certain information Monarca holds about you or your workspace, subject to authentication and applicable limitations.",
      "Correction: You may request that inaccurate or incomplete information be corrected.",
      "Deletion: You may request deletion of certain information, subject to legal, security, operational, and legitimate business retention requirements.",
      "Data copy: You may request a copy of certain information in a reasonably usable format where applicable and technically feasible.",
      "Withdrawal of consent: Where Monarca processes information based on consent, you may withdraw that consent. Withdrawal may affect Monarca's ability to provide the requested service or evaluate a partnership application.",
      "Disconnecting third-party platforms: You may disconnect supported third-party integrations through Monarca settings or the connected platform's permission settings. Disconnecting a platform may stop future synchronization but may not automatically delete data already processed by Monarca.",
      "Opting out of non-essential marketing: You may opt out of non-essential marketing messages where such messages are sent. Monarca may still send service, security, application, transactional, or administrative communications."
    ]
  },
  {
    title: "Cookies and Analytics",
    content: [
      "Monarca may use cookies or similar technologies for authentication, session management, language preference, security, product reliability, usage analytics, and user-facing functionality. Some cookies are necessary for the service to work. Others may help us understand how the website or product is used and improve reliability.",
      "Browser settings may allow you to block or delete cookies. Blocking necessary cookies may prevent parts of the website or product from functioning properly."
    ]
  },
  {
    title: "Children's Privacy",
    content: [
      "Monarca is intended for businesses and professional users. It is not directed to children, and Monarca does not knowingly collect personal information from children. If you believe a child has provided personal information to Monarca, please contact us so we can review and take appropriate action."
    ]
  },
  {
    title: "Third-Party Services",
    content: [
      "Monarca may link to, integrate with, or receive data from third-party services such as ecommerce platforms, advertising platforms, analytics tools, payment providers, authentication providers, and infrastructure providers. Those third-party services are governed by their own terms and privacy policies.",
      "Users should review the privacy and security practices of any third-party platform they connect to Monarca."
    ]
  },
  {
    title: "Changes to This Privacy Policy",
    content: [
      "Monarca may update this Privacy Policy from time to time to reflect changes in the product, data practices, legal requirements, or business operations. When we update the policy, we will revise the Last Updated date. If changes are material, Monarca may provide additional notice through the website, product, or other appropriate channels."
    ]
  },
  {
    title: "Contact Us",
    content: [
      "If you have questions about this Privacy Policy or want to make a privacy request, contact Monarca at [Privacy Contact Email]. This placeholder must be replaced with the correct privacy contact email before public launch."
    ]
  }
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#e7ebe8] px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_70px_rgba(15,23,42,0.05)] sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Monarca</p>
        <h1 className="mt-3 text-4xl font-black tracking-normal sm:text-5xl">Privacy Policy</h1>
        <p className="mt-4 text-sm font-semibold text-slate-500">Last Updated: August 23, 2026</p>

        <div className="mt-8 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-2xl font-black tracking-normal text-slate-950">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                {section.content.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.link ? (
                  <p>
                    <a
                      href={section.link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-emerald-700 underline underline-offset-4"
                    >
                      {section.link.label}
                    </a>
                  </p>
                ) : null}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6">
          <Link href="/apply" className="inline-flex rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">
            Back to Application
          </Link>
        </div>
      </article>
    </main>
  );
}
