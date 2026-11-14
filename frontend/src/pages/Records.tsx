import { Download, FileSpreadsheet, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, Button, Card, ClassLabel, Empty, ErrorBox, Input, PageHeader, Pagination, ProvenanceBadge, Select, Spinner, Table, Td } from "../components/ui";
import { download } from "../lib/api";
import { fmtDate, human } from "../lib/format";
import { can, useApi, useApp, usePageMeta } from "../lib/hooks";

export default function Records() {
  usePageMeta("Records", "Every uploaded survey file and the readings saved from it.");
  const { user, authReady } = useApp();
  const allowed = can(user, "auditor", "moderator");
  const [params, setParams] = useSearchParams();
  const file = params.get("file") ?? "";
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("");
  const [page, setPage] = useState(1);
  const files = useApi(allowed ? "/datasets" : null);
  const recs = useApi(allowed ? "/admin/observations" : null,
    { dataset_id: file || undefined, q: search || undefined, origin: origin || undefined, page, page_size: 25 }, [file, search, origin, page]);
  const [dlError, setDlError] = useState("");
  const pickFile = (id: string) => { setPage(1); setParams(id ? { file: id } : {}); };
  const chosen = files.data?.items?.find((d: any) => String(d.id) === file);

  if (!authReady) return null;
  if (!allowed) return <><PageHeader title="Records" /><SignInPrompt what="Viewing uploaded records needs a staff account." roles="staff" /></>;

  return (
    <>
      <PageHeader help="records" title="Records" lead="Every file uploaded to the site, and every reading saved in the database. Pick a file to see only its readings."
        actions={<Link to="/upload"><Button><FileSpreadsheet className="size-4" aria-hidden />Upload a file</Button></Link>} />
      {dlError && <ErrorBox message={dlError} />}

      <Card title="Uploaded files">
        {files.loading && !files.data ? <Spinner /> : !files.data?.items?.length ? (
          <Empty title="No files uploaded yet"><Link className="underline" to="/upload">Upload your first survey</Link>.</Empty>
        ) : (
          <Table head={["File", "Uploaded", "By", "Rows checked", "Saved readings", "Status", ""]}>
            {files.data.items.map((d: any) => (
              <tr key={d.id} className={String(d.id) === file ? "bg-raised" : undefined}>
                <Td className="font-medium">{d.filename}{d.source_note && <span className="block text-xs text-muted">{d.source_note}</span>}</Td>
                <Td className="whitespace-nowrap">{fmtDate(d.created_at)}</Td>
                <Td>{d.uploaded_by ?? "–"}</Td>
                <Td className="tabular">{d.valid_count} valid of {d.row_count}</Td>
                <Td className="tabular">{d.records}</Td>
                <Td><Badge tone={d.status === "imported" ? "ok" : d.status === "discarded" ? "danger" : "neutral"}>{d.status === "validated" ? "checked, not imported" : d.status}</Badge></Td>
                <Td className="whitespace-nowrap">
                  {d.records > 0 && <button className="mr-3 text-info underline" onClick={() => pickFile(String(d.id))}>View readings</button>}
                  <button className="text-info underline" onClick={() => download(`/datasets/${d.id}/cleaned.csv`).catch((e) => setDlError(e.message))}>Cleaned CSV</button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="mt-6" title={chosen ? `Readings from ${chosen.filename}` : "All readings"}
        actions={chosen && <Button small variant="outline" onClick={() => pickFile("")}>Show all readings</Button>}>
        <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}>
          <div className="min-w-56 flex-1"><Input aria-label="Search by place or area" placeholder="Search by place or area, e.g. Rajpur" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="w-48"><Select aria-label="Data source" value={origin} onChange={(e) => { setPage(1); setOrigin(e.target.value); }}
            options={[["", "All sources"], ["ground_measured", "Our survey"], ["imported", "Imported"], ["demo", "Demo data"]]} /></div>
          <Button type="submit" variant="outline"><Search className="size-4" aria-hidden />Search</Button>
          <Button type="button" variant="outline" onClick={() => download("/exports/observations.csv").catch((e) => setDlError(e.message))}><Download className="size-4" aria-hidden />Download all as CSV</Button>
        </form>
        {recs.error ? <ErrorBox message={recs.error} /> : recs.loading && !recs.data ? <Spinner /> : !recs.data?.items?.length ? <Empty title="No readings match" /> : (
          <>
            <Table head={["Place", "Area", "Measured", "Lux", "Lamp", "Result", "Source"]}>
              {recs.data.items.map((o: any) => (
                <tr key={o.id}>
                  <Td className="font-medium">{o.location.name}</Td>
                  <Td>{o.location.zone || "–"}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(o.measured_at)}</Td>
                  <Td className="tabular">{o.lux ?? "–"}</Td>
                  <Td>{human(o.fixture_status)}{o.fixture_wattage ? `, ${o.fixture_wattage} W` : ""}</Td>
                  <Td><ClassLabel k={o.classification} /></Td>
                  <Td><ProvenanceBadge origin={o.data_origin} verification={o.verification_status} /></Td>
                </tr>
              ))}
            </Table>
            <Pagination page={recs.data.page} pageSize={recs.data.page_size} total={recs.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
