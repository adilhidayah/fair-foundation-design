# FAIR Foundation Design — Philosophy & Concept

**Application name:** FAIR Foundation Design (working name)
**FAIR stands for:** Foundation Analysis & Intelligent Reporting
**Tagline:** *"Foundation calculations with transparent results."*

Write the name as **FAIR** Foundation Design — never "FAIR Foundation AI": the AI part is only data entry (section 4).

---

## 1. Core Identity & Vision

FAIR Foundation Design is a foundation design calculator. Its first module covers **oil & gas equipment**:
vertical and horizontal vessels, tanks, heat exchangers, pumps, compressors, turbines, reciprocating machines,
pipe racks, and skid-mounted package units. The core checks are general, so further modules (e.g. building
foundations) can be added on the same engine.

It is built for structural and geotechnical engineers who must produce calculations that are correct,
traceable, and ready for checker review. FAIR speeds up the repetitive parts of that work — data entry,
load combination bookkeeping, report formatting — without taking engineering judgement away from the engineer.

## 2. The Meaning Behind the Name

**F.A.I.R. = Foundation Analysis & Intelligent Reporting**

- **Foundation Analysis** — the deterministic calculation engine. It evaluates bearing capacity, settlement,
  overturning and sliding stability, pile group reactions, pedestal P-M interaction, anchor bolts,
  one-way and punching shear, and flexure for isolated footings, pedestals, and pile caps. Equipment-specific
  checks are added per category: vibration and mass ratio for rotating machinery, 1× / 2× dynamic forces for
  reciprocating machinery, two-direction stability for pipe racks, and bolt-load concentration for skids.

- **Intelligent Reporting** — a structured, code-generated calculation sheet: input parameters, formulas with
  substituted values, load combination tables, and a PASS/FAIL summary with unity checks. "Intelligent" refers
  to how the report is assembled and kept in sync with the calculation, not to AI writing its content.
  **Every number in the report comes from the calculation engine.**

## 3. Three Pillars

1. **Accuracy** — calculations follow the stated design codes: **ACI 318M-19** (concrete) and **ASCE 7-22**
   (loads). Formulas are validated against hand calculations before use. The target is that every check
   cites its code clause in the report (already done for shear, pedestal, and anchor checks; in progress for
   the rest).
2. **Transparency** — no black box. Every formula, assumption, safety factor, and soil correlation method is
   shown and can be audited by a senior engineer or checker. Soil parameters derived from correlations
   (e.g. SPT → φ, cu, Es) always state the method used and a reminder to verify against the geotechnical report.
3. **Efficiency** — repetitive tasks are automated: generating load combinations, iterating foundation size,
   extracting data from documents, and formatting the report.

## 4. Human-AI Collaboration

FAIR follows a strict **Human-in-the-Loop** principle.

**What AI does — input only:**
- Reads unstructured sources (datasheets, geotechnical reports, load tables, and reactions exported from
  analysis software such as SAP2000, STAAD, or SACS) and turns them into structured candidate values.
- Places those values into the form, **highlighted for review**. Nothing is used until the engineer confirms it.

**What AI never does:**
- Calculate, estimate, or "correct" any result.
- Decide safety factors, code clauses, or whether a design passes.
- Write numbers into the calculation report.

**What the calculation engine does — deterministically, in code:**
- All engineering calculations.
- Iterative foundation sizing (**Auto-Size**): trial dimensions → self-weight → re-check → adjust, until all
  checks pass. This is a numerical solver, not AI.

**What the engineer does:**
- Verifies every input, owns every design decision, and signs off the result. The engineer remains the
  ultimate authority for safety factors, code compliance, and structural integrity.

## 5. Core Values

- **Clarity over complexity** — complex checks presented as clean tables, diagrams, and clear PASS/FAIL results.
- **Speed without compromise** — less time on data entry and formatting, no shortcuts in the analysis itself.
- **Checker-ready output** — reports are structured for design review and client handover. They support,
  and never replace, the responsible engineer's review and sign-off.

## 6. Current Scope

| Area | Status |
|---|---|
| Codes | ACI 318M-19, ASCE 7-22. Other codes (e.g. SNI) are **not** implemented. |
| Foundation types | Isolated footing + pedestal, footing only, pile cap with pile group |
| Pile capacity | Entered by the user (allowable compression / tension / lateral); not calculated from soil data |
| Equipment categories | Static equipment fully wired in the UI. Rotating, reciprocating, pipe rack, and skid-mounted calculation modules exist in the library; their dedicated UI helpers are still pending. |
| AI data entry | OCR / paste import for load types, equipment weights, and load combination tables (with review step). Broader AI assistant planned — see `AI_ASSISTANT_PLAN.md`. |
| Planned module | Building foundations (column reactions from ETABS / SAP2000, combined and strap footings; would also need SNI 2847 / SNI 1726 if used for Indonesian projects) |
| Not in scope yet | Mat foundations, soil-structure interaction, deep foundation capacity calculation |

The scope table is updated whenever a capability is added, so the document never claims more than the
application actually does.
