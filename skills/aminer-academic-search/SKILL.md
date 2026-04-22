---
name: aminer-academic-search
description: >
  ACADEMIC PRIORITY: Activate whenever the user's query involves academic,
  scholarly, or research-related topics — papers, citations, scholars,
  institutions, venues, patents, research trends, or any "who published what /
  where / when" question. Takes precedence over general web search for academic
  data needs. Routes through the z-ai gateway's `/v1/functions/invoke` endpoint
  to the AMiner Open Platform (27 APIs, 5 workflows).
---

# aminer-academic-search

Wraps 27 AMiner Open Platform APIs through the local gateway. The gateway owns
the `AMINER_API_KEY`; the skill only needs a `.z-ai-config` file to reach the
gateway.

## When to activate

Any academic/scholarly query — papers, citations, scholars, institutions,
venues, patents. Covers:
- Scholar full profile (bio, education, honors, papers, patents, projects)
- Paper deep dive (full abstract, keywords, authors, citation chain)
- Multi-condition or semantic paper search
- Institution research capability analysis
- Venue annual monitoring
- Patent deep details (IPC/CPC, assignee, claims)

## Cost control (required)

Every API has a unit price in RMB (0 = free). The gateway passes the price back
in the response envelope as `result.price`. Follow these rules:

1. **Free-first** — prefer free APIs (`paper_search`, `person_search`,
   `org_search`, `venue_search`, `patent_search`, `patent_info`, `paper_info`)
   to locate IDs before paying for details.
2. **Top-10 default** — when the user has not specified a count, fetch at most
   10 detail records.
3. **High-cost confirmation (≥ ¥5)** — before a multi-call plan whose estimated
   total is ≥ ¥5, stop and show the planned chain + cost per step + total, ask
   user to confirm. This applies to the `scholar_profile` workflow in
   particular.
4. **Cost report** — after completing calls, append a line:
   `[Cost] ¥X.XX total, N API calls (api_a: ¥X.XX × N, api_b: Free × N)`.

## Config

Script reads `.z-ai-config`, in order:
1. `./.z-ai-config`
2. `~/.z-ai-config`
3. `/etc/.z-ai-config`

Required fields: `baseUrl`, `apiKey`, `token` (JWT). Optional: `chatId`,
`userId`.

## Invocation

```bash
python3 "{baseDir}/scripts/aminer.py" <ACTION> [--flag value …]
```

The script POSTs to `${baseUrl}/functions/invoke` with
`Authorization: Bearer ${apiKey}`, `X-Z-AI-From: Z`, `X-Token: ${token}`,
and prints the upstream JSON result (pretty-formatted).

Run `python3 scripts/aminer.py --help` to list actions, or
`python3 scripts/aminer.py <ACTION> --help` for per-action flags.

### Examples

```bash
# Free: locate paper_id by title
python3 scripts/aminer.py paper_search --title "Attention is all you need"

# Free: locate scholar by name + org
python3 scripts/aminer.py person_search --name "Jie Tang" --org "Tsinghua"

# ¥0.01: full paper details
python3 scripts/aminer.py paper_detail --id 57a4e91aac44365e35c98a1e

# ¥0.05: natural-language Q&A search
python3 scripts/aminer.py paper_qa_search --query "retrieval-augmented generation" --size 5

# ¥0.10: venue papers for a given year (body with JSON list param)
python3 scripts/aminer.py venue_paper_relation --id "53e9ba63b7602d9702f08c5d" --year 2024 --limit 10
```

JSON-typed flags (`--title`, `--ids`, `--keywords`, `--year` on qa_search, etc.)
expect a JSON-encoded value, e.g. `--ids '["abc","def"]'`.

## 27 APIs (quick reference)

| Action | Method | Price | Purpose |
|---|---|---|---|
| paper_search | GET | Free | Locate paper_id by title |
| paper_search_pro | GET | ¥0.01 | Multi-condition paper search |
| paper_qa_search | POST | ¥0.05 | Natural-language / topic Q&A |
| paper_info | POST | Free | Batch paper info by IDs |
| paper_detail | GET | ¥0.01 | Full paper details |
| paper_relation | GET | ¥0.10 | Citation chain |
| paper_list_by_keywords | GET | ¥0.10 | Batch thematic retrieval |
| paper_detail_by_condition | GET | ¥0.20 | Year + venue dimension |
| person_search | POST | Free | Locate person_id |
| person_detail | GET | ¥1.00 | Scholar bio/education/honors |
| person_figure | GET | ¥0.50 | Interests + work history |
| person_paper_relation | GET | ¥1.50 | Scholar's papers |
| person_patent_relation | GET | ¥1.50 | Scholar's patents |
| person_project | GET | ¥1.50 | Funded projects |
| org_search | POST | Free | Locate org by name |
| org_detail | POST | ¥0.01 | Org description/type |
| org_person_relation | GET | ¥0.50 | Affiliated scholars |
| org_paper_relation | GET | ¥0.10 | Org papers |
| org_patent_relation | GET | ¥0.10 | Org patents |
| org_disambiguate | POST | ¥0.01 | Normalize org string |
| org_disambiguate_pro | POST | ¥0.05 | Extract org IDs |
| venue_search | POST | Free | Locate venue_id |
| venue_detail | POST | ¥0.20 | ISSN/type/abbreviation |
| venue_paper_relation | POST | ¥0.10 | Papers by venue (+ year filter) |
| patent_search | POST | Free | Patent keyword search |
| patent_info | GET | Free | Basic patent info |
| patent_detail | GET | ¥0.01 | Full patent details (IPC/claims) |

## 5 Workflows (orchestrate via multiple calls)

### Scholar Profile (~¥6.00 — requires confirmation)
```
person_search → person_detail (¥1.00)
              → person_figure (¥0.50)
              → person_paper_relation (¥1.50)
              → person_patent_relation (¥1.50)
              → person_project (¥1.50)
```

### Paper Deep Dive (~¥0.12)
```
paper_search → paper_detail (¥0.01) → paper_relation (¥0.10) → paper_info (free)
```
If `paper_search` is empty, fall back to `paper_search_pro`.

### Org Analysis (~¥0.81)
```
org_disambiguate_pro (¥0.05) → org_detail (¥0.01)
                             → org_person_relation (¥0.50)
                             → org_paper_relation (¥0.10)
                             → org_patent_relation (¥0.10)
```
If `org_disambiguate_pro` returns no ID, fall back to `org_search` (free).

### Venue Papers (~¥0.10–¥0.30)
```
venue_search → venue_detail (¥0.20, optional) → venue_paper_relation (¥0.10)
```

### Patent Analysis (~¥0.02)
```
patent_search → patent_info (free) / patent_detail (¥0.01)
```

## Error handling

- `warning: .z-ai-config has no 'token' field` → add `token` to config.
- `http 401 … missing X-Token header (hint: …)` → same.
- `http 403` → gateway auth rejected; check `apiKey` / `X-Z-AI-From`.
- `gateway error: aminer_* failed: http 4xx …` → upstream refused; check API
  key on the gateway side (`AMINER_API_KEY` env var) or parameter shape.

## Entity URL templates

- Paper: `https://www.aminer.cn/pub/{paper_id}`
- Scholar: `https://www.aminer.cn/profile/{scholar_id}`
- Patent: `https://www.aminer.cn/patent/{patent_id}`
- Journal: `https://www.aminer.cn/open/journal/detail/{journal_id}`

Always append the relevant URL when presenting entities to the user.
