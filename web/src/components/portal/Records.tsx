import { useState, type FormEvent } from "react";
import { Archive, Download, Eye, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Badge,
  DateRange,
  FilterBar,
  FilterField,
  FilterInput,
  FilterSelect,
  F,
  input,
  Modal,
  Pager,
  Table,
  Tabs,
} from "./kit";
import {
  useArchiveDocument,
  useCreateInvestment,
  useCreateTransaction,
  useDeleteDocument,
  useDocuments,
  useInstitutions,
  useInvestments,
  useTransactions,
  useUpdateInvestment,
  useUploadDocument,
} from "@/lib/api/hooks";
import { documentsApi } from "@/lib/api/endpoints";
import { downloadBlob, errorMessage, saveBlob } from "@/lib/api/client";
import type {
  CompoundingFrequency,
  Document,
  DocumentCategory,
  Investment,
  InvestmentStatus,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "@/lib/api/types";
import {
  compoundingLabel,
  documentCategoryLabel,
  documentStatusLabel,
  fmtDate,
  fmtDateTime,
  fmtSize,
  investmentStatusLabel,
  pct,
  signedAmount,
  transactionStatusLabel,
  transactionTypeLabel,
  usd,
} from "@/lib/format";

const PAGE_SIZE = 10;

const INVESTMENT_STATUSES: InvestmentStatus[] = ["ACTIVE", "PENDING", "MATURED", "CLOSED"];
const COMPOUNDING: CompoundingFrequency[] = ["SIMPLE", "MONTHLY", "QUARTERLY", "SEMIANNUALLY", "ANNUALLY"];
const TRANSACTION_TYPES: TransactionType[] = ["DEPOSIT", "WITHDRAWAL", "INTEREST"];
const TRANSACTION_STATUSES: TransactionStatus[] = ["COMPLETED", "PENDING", "FAILED"];
const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "IDENTIFICATION",
  "INVESTMENT_AGREEMENT",
  "STATEMENT",
  "TAX_DOCUMENT",
  "OTHER",
];
/** Mirrors `CLIENT_ALLOWED_CATEGORIES` on the server. */
const CLIENT_UPLOAD_CATEGORIES: DocumentCategory[] = ["IDENTIFICATION", "TAX_DOCUMENT", "OTHER"];

const errorText = (error: unknown) => errorMessage(error, "The request could not be completed.");

/* ------------------------------------------------------------ investments */

export function Investments({ clientId, editable = false }: { clientId?: string; editable?: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvestmentStatus | "">("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Investment | null>(null);
  const [edit, setEdit] = useState<Investment | "new" | null>(null);

  const { data, isPending, error } = useInvestments({
    page,
    pageSize: PAGE_SIZE,
    ...(clientId ? { clientId } : {}),
    ...(status ? { status } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    sortBy: "startDate",
    sortDir: "desc",
  });

  const rows = data?.data ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <FilterBar>
        <FilterField label="Search">
          <FilterInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search investments"
          />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect
            value={status}
            onChange={(value) => {
              setStatus(value as InvestmentStatus | "");
              setPage(1);
            }}
            options={INVESTMENT_STATUSES.map((value) => ({
              label: investmentStatusLabel[value],
              value,
            }))}
          />
        </FilterField>
        {editable && (
          <Button onClick={() => setEdit("new")} disabled={!clientId} title={clientId ? undefined : "Open a client account to add investments"}>
            <Plus />
            Add investment
          </Button>
        )}
      </FilterBar>

      {error && <p className="text-sm text-destructive">{errorText(error)}</p>}

      <Table
        head={["Investment", "Principal", "Annual rate", "Maturity", "Projected balance", "Status", ""]}
        empty={!isPending && rows.length === 0}
      >
        {rows.map((investment) => (
          <tr key={investment.id}>
            <td>
              <span className="font-semibold">{investment.name}</span>
              <p className="text-xs text-muted-foreground">
                {investment.institution?.name ?? "—"}
                {investment.client ? ` · ${investment.client.fullName}` : ""}
              </p>
            </td>
            <td className="tabular-nums">{usd(investment.currentPrincipal)}</td>
            <td>{pct(investment.annualInterestRate)}</td>
            <td>{fmtDate(investment.maturityDate)}</td>
            <td className="tabular-nums">{usd(investment.projectedMaturityBalance)}</td>
            <td>
              <Badge>{investment.status}</Badge>
            </td>
            <td>
              <div className="flex items-center">
                <Button variant="ghost" size="icon" aria-label={`View ${investment.name}`} onClick={() => setSelected(investment)}>
                  <Eye />
                </Button>
                {editable && (
                  <Button variant="link" onClick={() => setEdit(investment)}>
                    Edit
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {isPending && <p className="text-sm text-muted-foreground">Loading investments…</p>}
      <Pager page={page} pages={totalPages} onPage={setPage} />

      {selected && <InvestmentDetail investment={selected} onClose={() => setSelected(null)} />}

      {edit && (
        <InvestmentForm
          investment={edit === "new" ? null : edit}
          clientId={clientId}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function InvestmentDetail({ investment, onClose }: { investment: Investment; onClose: () => void }) {
  const transactions = useTransactions({ investmentId: investment.id, pageSize: 50 });
  const documents = useDocuments({ investmentId: investment.id, pageSize: 50 });

  const facts: Array<[string, string]> = [
    ["Institution", investment.institution?.name ?? "—"],
    ["Principal", usd(investment.principalAmount)],
    ["Current principal", usd(investment.currentPrincipal)],
    ["Annual rate", pct(investment.annualInterestRate)],
    ["Compounding", compoundingLabel[investment.compoundingFrequency]],
    ["Term", investment.termYears === null ? "—" : `${investment.termYears.toFixed(2)} years`],
    ["Start", fmtDate(investment.startDate)],
    ["Maturity", fmtDate(investment.maturityDate)],
    ["Projected return", usd(investment.projectedReturn)],
    ["Projected balance", usd(investment.projectedMaturityBalance)],
    ["Last updated", fmtDateTime(investment.lastUpdatedAt)],
    ["Status", investmentStatusLabel[investment.status]],
  ];

  return (
    <Modal open title={investment.name} onClose={onClose}>
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {investment.notes && <p className="text-sm text-muted-foreground">{investment.notes}</p>}
        {investment.calculationMethodology && (
          <p className="text-xs text-muted-foreground">{investment.calculationMethodology}</p>
        )}
        <div>
          <h3 className="text-xl">Related transactions</h3>
          <div className="mt-2 space-y-2">
            {(transactions.data?.data ?? []).map((transaction) => (
              <div key={transaction.id} className="flex justify-between gap-3 border-b border-border pb-2 text-sm">
                <span>
                  {transactionTypeLabel[transaction.type]} · {fmtDate(transaction.transactionDate)}
                </span>
                <span className="tabular-nums">
                  {signedAmount(transaction.type, transaction.amount)} · {transactionStatusLabel[transaction.status]}
                </span>
              </div>
            ))}
            {!transactions.isPending && (transactions.data?.data.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No transactions recorded for this investment.</p>
            )}
          </div>
        </div>
        <div>
          <h3 className="text-xl">Related documents</h3>
          <div className="mt-2 space-y-2">
            {(documents.data?.data ?? []).map((document) => (
              <div key={document.id} className="flex justify-between gap-3 border-b border-border pb-2 text-sm">
                <span>{document.title}</span>
                <span className="text-muted-foreground">{documentStatusLabel[document.status]}</span>
              </div>
            ))}
            {!documents.isPending && (documents.data?.data.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No documents linked to this investment.</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function InvestmentForm({
  investment,
  clientId,
  onClose,
}: {
  investment: Investment | null;
  clientId: string | undefined;
  onClose: () => void;
}) {
  const institutions = useInstitutions({ pageSize: 100 });
  const create = useCreateInvestment();
  const update = useUpdateInvestment();
  const submitting = create.isPending || update.isPending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate") ?? "");
    const maturityDate = String(form.get("maturityDate") ?? "");
    if (maturityDate <= startDate) {
      toast.error("Maturity must be after the start date.");
      return;
    }
    const values = {
      institutionId: String(form.get("institutionId") ?? ""),
      name: String(form.get("name") ?? "").trim(),
      principalAmount: String(form.get("principalAmount") ?? ""),
      annualInterestRate: String(form.get("annualInterestRate") ?? ""),
      compoundingFrequency: String(form.get("compoundingFrequency")) as CompoundingFrequency,
      startDate,
      maturityDate,
      status: String(form.get("status")) as InvestmentStatus,
      notes: String(form.get("notes") ?? "").trim(),
    };
    try {
      if (investment) {
        await update.mutateAsync({ id: investment.id, input: values });
        toast.success("Investment updated.");
      } else {
        if (!clientId) throw new Error("A client must be selected before adding an investment.");
        await create.mutateAsync({ clientId, ...values });
        toast.success("Investment created.");
      }
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const options = institutions.data?.data ?? [];

  return (
    <Modal open title={investment ? "Edit investment" : "Add investment"} onClose={onClose}>
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submit}>
        <F label="Investment name" className="sm:col-span-2">
          {(id) => <input id={id} name="name" className={input} defaultValue={investment?.name ?? ""} required />}
        </F>
        <F label="Institution">
          {(id) => (
            <select id={id} name="institutionId" className={input} defaultValue={investment?.institutionId ?? ""} required>
              <option value="" disabled>
                Select an institution
              </option>
              {options.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}
                </option>
              ))}
            </select>
          )}
        </F>
        <F label="Principal (USD)">
          {(id) => (
            <input
              id={id}
              name="principalAmount"
              className={input}
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={investment?.principalAmount ?? ""}
              required
            />
          )}
        </F>
        <F label="Annual rate (%)">
          {(id) => (
            <input
              id={id}
              name="annualInterestRate"
              className={input}
              type="number"
              min="0"
              max="1000"
              step="0.0001"
              defaultValue={investment?.annualInterestRate ?? ""}
              required
            />
          )}
        </F>
        <F label="Compounding">
          {(id) => (
            <select
              id={id}
              name="compoundingFrequency"
              className={input}
              defaultValue={investment?.compoundingFrequency ?? "SIMPLE"}
            >
              {COMPOUNDING.map((value) => (
                <option key={value} value={value}>
                  {compoundingLabel[value]}
                </option>
              ))}
            </select>
          )}
        </F>
        <F label="Start date">
          {(id) => (
            <input id={id} name="startDate" type="date" className={input} defaultValue={investment?.startDate ?? ""} required />
          )}
        </F>
        <F label="Maturity date">
          {(id) => (
            <input id={id} name="maturityDate" type="date" className={input} defaultValue={investment?.maturityDate ?? ""} required />
          )}
        </F>
        <F label="Status">
          {(id) => (
            <select id={id} name="status" className={input} defaultValue={investment?.status ?? "ACTIVE"}>
              {INVESTMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {investmentStatusLabel[value]}
                </option>
              ))}
            </select>
          )}
        </F>
        <F label="Notes" className="sm:col-span-2">
          {(id) => <textarea id={id} name="notes" className={input} defaultValue={investment?.notes ?? ""} rows={3} />}
        </F>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={submitting}>{submitting ? "Saving…" : "Save investment"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ transactions */

const TRANSACTION_TABS = ["All", "Deposits", "Withdrawals", "Interest"] as const;
type TransactionTab = (typeof TRANSACTION_TABS)[number];

const TAB_TYPE: Record<Exclude<TransactionTab, "All">, TransactionType> = {
  Deposits: "DEPOSIT",
  Withdrawals: "WITHDRAWAL",
  Interest: "INTEREST",
};

export function Transactions({ clientId, editable = false }: { clientId?: string; editable?: boolean }) {
  const [tab, setTab] = useState<TransactionTab>("All");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransactionStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);

  const { data, isPending, error } = useTransactions({
    page,
    pageSize: PAGE_SIZE,
    ...(clientId ? { clientId } : {}),
    ...(tab === "All" ? {} : { type: TAB_TYPE[tab] }),
    ...(status ? { status } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  const rows = data?.data ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const reset = (update: () => void) => {
    update();
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} options={TRANSACTION_TABS} onChange={(value) => reset(() => setTab(value))} />
        {editable && (
          <Button onClick={() => setOpen(true)} disabled={!clientId}>
            <Plus />
            Add transaction
          </Button>
        )}
      </div>

      <FilterBar>
        <FilterField label="Search">
          <FilterInput
            value={search}
            onChange={(value) => reset(() => setSearch(value))}
            placeholder="Search transactions"
          />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect
            value={status}
            onChange={(value) => reset(() => setStatus(value as TransactionStatus | ""))}
            options={TRANSACTION_STATUSES.map((value) => ({
              label: transactionStatusLabel[value],
              value,
            }))}
          />
        </FilterField>
        <FilterField label="Date range">
          <DateRange
            from={from}
            to={to}
            onFromChange={(value) => reset(() => setFrom(value))}
            onToChange={(value) => reset(() => setTo(value))}
          />
        </FilterField>
        {editable && (
          <Button onClick={() => setOpen(true)} disabled={!clientId}>
            <Plus />
            Add transaction
          </Button>
        )}
      </FilterBar>

      {error && <p className="text-sm text-destructive">{errorText(error)}</p>}

      <Table
        head={["Reference / date", "Type", "Description", "Investment", "Amount", "Status"]}
        empty={!isPending && rows.length === 0}
      >
        {rows.map((transaction) => (
          <tr key={transaction.id}>
            <td>
              <span className="font-mono text-xs">{transaction.id.slice(0, 8)}</span>
              <p className="text-xs text-muted-foreground">{fmtDateTime(transaction.transactionDate)}</p>
            </td>
            <td>{transactionTypeLabel[transaction.type]}</td>
            <td>
              {transaction.description ?? "—"}
              {transaction.client && <p className="text-xs text-muted-foreground">{transaction.client.fullName}</p>}
            </td>
            <td>{transaction.investment?.name ?? "—"}</td>
            <td className="tabular-nums">{signedAmount(transaction.type, transaction.amount)}</td>
            <td>
              <Badge>{transaction.status}</Badge>
            </td>
          </tr>
        ))}
      </Table>
      {isPending && <p className="text-sm text-muted-foreground">Loading transactions…</p>}
      <Pager page={page} pages={totalPages} onPage={setPage} />

      {open && clientId && <TransactionForm clientId={clientId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function TransactionForm({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const investments = useInvestments({ clientId, pageSize: 100 });
  const create = useCreateTransaction();
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const investmentId = String(form.get("investmentId") ?? "");
    try {
      await create.mutateAsync({
        clientId,
        ...(investmentId ? { investmentId } : {}),
        type: String(form.get("type")) as TransactionType,
        amount: String(form.get("amount") ?? ""),
        status: String(form.get("status")) as TransactionStatus,
        transactionDate: String(form.get("transactionDate") ?? ""),
        ...(String(form.get("description") ?? "").trim()
          ? { description: String(form.get("description")).trim() }
          : {}),
        idempotencyKey,
      });
      toast.success("Transaction recorded.");
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const options = investments.data?.data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal open title="Add transaction" onClose={onClose}>
      <form className="grid gap-4" onSubmit={submit}>
        <F label="Type">
          {(id) => (
            <select id={id} name="type" className={input} defaultValue="DEPOSIT">
              {TRANSACTION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {transactionTypeLabel[value]}
                </option>
              ))}
            </select>
          )}
        </F>
        <F label="Investment (optional)">
          {(id) => (
            <select id={id} name="investmentId" className={input} defaultValue="">
              <option value="">No linked investment</option>
              {options.map((investment) => (
                <option key={investment.id} value={investment.id}>
                  {investment.name}
                </option>
              ))}
            </select>
          )}
        </F>
        <F label="Amount (USD)">
          {(id) => <input id={id} name="amount" type="number" min="0.01" step="0.01" className={input} required />}
        </F>
        <F label="Date">
          {(id) => <input id={id} name="transactionDate" type="date" className={input} defaultValue={today} required />}
        </F>
        <F label="Status">
          {(id) => (
            <select id={id} name="status" className={input} defaultValue="COMPLETED">
              {TRANSACTION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {transactionStatusLabel[value]}
                </option>
              ))}
            </select>
          )}
        </F>
        <F label="Description">
          {(id) => <textarea id={id} name="description" className={input} rows={2} />}
        </F>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={create.isPending}>{create.isPending ? "Saving…" : "Save transaction"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------------- documents */

export function Documents({ clientId, editable = false }: { clientId?: string; editable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED" | "">("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Document | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Document | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isPending, error } = useDocuments({
    page,
    pageSize: PAGE_SIZE,
    ...(clientId ? { clientId } : {}),
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  const archive = useArchiveDocument();
  const remove = useDeleteDocument();

  const rows = data?.data ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const reset = (update: () => void) => {
    update();
    setPage(1);
  };

  const download = async (document: Document) => {
    setDownloading(document.id);
    try {
      const { url } = await documentsApi.signedUrl(document.id);
      const blob = await downloadBlob(url);
      saveBlob(blob, document.originalFilename);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setDownloading(null);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archive.mutateAsync(archiveTarget.id);
      toast.success("Document archived.");
      setArchiveTarget(null);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const confirmDelete = async (document: Document) => {
    try {
      await remove.mutateAsync(document.id);
      toast.success("Document deleted.");
      setSelected(null);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <div className="space-y-5">
      <FilterBar>
        <FilterField label="Search">
          <FilterInput
            value={search}
            onChange={(value) => reset(() => setSearch(value))}
            placeholder="Search documents"
          />
        </FilterField>
        <FilterField label="Category">
          <FilterSelect
            value={category}
            onChange={(value) => reset(() => setCategory(value as DocumentCategory | ""))}
            options={DOCUMENT_CATEGORIES.map((value) => ({
              label: documentCategoryLabel[value],
              value,
            }))}
          />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect
            value={status}
            onChange={(value) => reset(() => setStatus(value as "ACTIVE" | "ARCHIVED" | ""))}
            options={[
              { label: "Active", value: "ACTIVE" },
              { label: "Archived", value: "ARCHIVED" },
            ]}
          />
        </FilterField>
        <Button onClick={() => setOpen(true)}>
          <Upload />
          Upload document
        </Button>
      </FilterBar>

      {error && <p className="text-sm text-destructive">{errorText(error)}</p>}

      <Table
        head={["Document", "Category", "Uploaded", "Size / type", "Status", "Actions"]}
        empty={!isPending && rows.length === 0}
      >
        {rows.map((document) => (
          <tr key={document.id}>
            <td>
              <span className="font-semibold">{document.title}</span>
              {document.client && <p className="text-xs text-muted-foreground">{document.client.fullName}</p>}
            </td>
            <td>{documentCategoryLabel[document.category]}</td>
            <td>
              {fmtDate(document.uploadedAt)}
              <p className="text-xs text-muted-foreground">{document.uploadedBy?.fullName ?? "System"}</p>
            </td>
            <td>
              {fmtSize(document.fileSize)} · {(document.fileExtension ?? "file").replace(".", "").toUpperCase()}
            </td>
            <td>
              <Badge>{document.status}</Badge>
            </td>
            <td>
              <div className="flex">
                <Button variant="ghost" size="icon" aria-label={`View ${document.title}`} onClick={() => setSelected(document)}>
                  <Eye />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Download ${document.title}`}
                  disabled={downloading === document.id}
                  onClick={() => void download(document)}
                >
                  <Download />
                </Button>
                {editable && document.status === "ACTIVE" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Archive ${document.title}`}
                    onClick={() => setArchiveTarget(document)}
                  >
                    <Archive />
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {isPending && <p className="text-sm text-muted-foreground">Loading documents…</p>}
      <Pager page={page} pages={totalPages} onPage={setPage} />

      {open && (
        <UploadDocumentForm
          clientId={clientId}
          categories={editable ? DOCUMENT_CATEGORIES : CLIENT_UPLOAD_CATEGORIES}
          onClose={() => setOpen(false)}
        />
      )}

      <Modal open={Boolean(selected)} title={selected?.title ?? "Document"} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {(
                [
                  ["Category", documentCategoryLabel[selected.category]],
                  ["Status", documentStatusLabel[selected.status]],
                  ["File", selected.originalFilename],
                  ["Size", fmtSize(selected.fileSize)],
                  ["Uploaded", fmtDateTime(selected.uploadedAt)],
                  ["Uploaded by", selected.uploadedBy?.fullName ?? "System"],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void download(selected)} disabled={downloading === selected.id}>
                <Download />
                Download
              </Button>
              {editable && selected.status === "ACTIVE" && (
                <Button variant="outline" onClick={() => setArchiveTarget(selected)}>
                  <Archive />
                  Archive
                </Button>
              )}
              {editable && (
                <Button variant="outline" onClick={() => void confirmDelete(selected)} disabled={remove.isPending}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(archiveTarget)} title="Archive document" onClose={() => setArchiveTarget(null)}>
        <p className="text-sm text-muted-foreground">
          Archiving hides the document from active lists but keeps the file and its history. You can restore it later by
          uploading a replacement if needed.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setArchiveTarget(null)}>
            Cancel
          </Button>
          <Button onClick={() => void confirmArchive()} disabled={archive.isPending}>
            {archive.isPending ? "Archiving…" : "Archive document"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function UploadDocumentForm({
  clientId,
  categories,
  onClose,
}: {
  clientId: string | undefined;
  categories: DocumentCategory[];
  onClose: () => void;
}) {
  const upload = useUploadDocument();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      toast.error("Choose a file to upload.");
      return;
    }
    const description = String(form.get("description") ?? "").trim();
    try {
      await upload.mutateAsync({
        file,
        title: String(form.get("title") ?? "").trim(),
        category: String(form.get("category")) as DocumentCategory,
        ...(clientId ? { clientId } : {}),
        ...(description ? { description } : {}),
      });
      toast.success("Document uploaded.");
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open title="Upload document" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <F label="Document title">
          {(id) => <input id={id} name="title" className={input} required maxLength={200} />}
        </F>
        <F label="Category">
          {(id) => (
            <select id={id} name="category" className={input} defaultValue={categories[0] ?? "OTHER"}>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {documentCategoryLabel[value]}
                </option>
              ))}
            </select>
          )}
        </F>
        <F label="Description">
          {(id) => <textarea id={id} name="description" className={input} rows={2} />}
        </F>
        <F label="File (PDF, JPEG, PNG, WebP or TXT · max 10 MB)">
          {(id) => <input id={id} name="file" type="file" className={input} accept=".pdf,.jpg,.jpeg,.png,.webp,.txt" required />}
        </F>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={upload.isPending}>{upload.isPending ? "Uploading…" : "Upload document"}</Button>
        </div>
      </form>
    </Modal>
  );
}
