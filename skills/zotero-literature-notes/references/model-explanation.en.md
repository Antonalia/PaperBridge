# Reading model methods in depth

[简体中文](model-explanation.md) | **English**

Explain a complete training call and deployment call along actual data flow, not a list of module names. Match requested language and genuinely inspected style samples. Verify the collection-based filename/path first. Let the full filename provide the inline title; omit a duplicate H1 when inline titles are enabled. Start with a compact publication-date/venue table, distinguishing preprint from formal dates, then explain the research problem, existing tension and core idea.

Comparisons default to work actually cited/discussed/compared in the source. History and similar notes are insufficient. Mark explicitly requested external comparisons as extensions.

## Build the computation

State task, inputs, outputs and minimal complete flow, then explain each mechanism in computation order: purpose, input origins, operation, output consumer, learned/frozen/cached state and verified predecessor differences. Use connected prose rather than repeating six headings for every module.

Distinguish observations, targets, inference noise, hidden states and generated results. Identify time, token, depth and batch/head/channel axes. Frames are not tokens, sparse communication is not deletion of layers, and intermediate future representations are not already generated video.

## Every formula needs complete definitions and operations

Introduce the concrete problem, present the verified original expression with equation/page evidence, then explain each quantity—including the left side, parameters, constants, functions, sets, indices, hats and every sub/superscript. Label derivations/equivalent rewrites; do not give them an original equation number. Define reused variables briefly near each core expression so readers need not guess from earlier pages.

For complex expressions use **symbol | meaning and source | shape/range | role**. State whether quantities are observations, targets, noise, hidden states, outputs or learned parameters; where they originate; and whether they are updated, frozen, sampled or cached. Explain modality/stage/layer/time/token/batch labels, powers versus transposes, sum/sampling bounds, dimensions and valid ranges. State undisclosed dimensions instead of inventing them; label structurally inferred dimensions and teaching choices.

Explain the actual axes used by matrix/elementwise multiplication, concatenation, weighted sums, transposition, broadcasting, softmax, norms, expectations and differentiation. Split complicated expressions into intermediate results and demonstrate shape compatibility, which axes change and what consumes the result. Attention needs the query/key/value origins, scaling, mask, normalization axis and why output remains indexed by queries. Losses need prediction/target correspondence, reduction dimensions and gradient destinations. Noise paths/integrals need endpoints, direction, step sign and conditions. A translated formula name or parameter glossary alone does not explain the mechanism.

## Work numerical examples through

Give a small complete example per core mechanism, reusing it across adjacent equations when useful. State teaching inputs, dimensions and assumptions, compute intermediate values and final output, then explain the result. Examples do not replace symbol definitions.

For weighted fusion, two aligned vectors $v_1=[2,4]$, $v_2=[6,8]$ with weights $\alpha_1=0.25$, $\alpha_2=0.75$ give $\bar v=0.25[2,4]+0.75[6,8]=[5,7]$. Define vectors, weights and output, note weights sum to one and length stays two. If the paper fuses both K and V, demonstrate both with the same weights rather than an unrelated vector average.

Attention examples calculate a row of scores, normalized weights and output. Sampling/velocity examples calculate an actual time point or update. Loss examples show prediction, target, residual and reduction. State rounding and verify arithmetic if necessary. Check sums, axes, shapes, sign and boundary values.

Label all chosen values **constructed teaching examples, not measured results or implementation settings**. Do not attribute chosen dimensions, step counts, noise or Euler demonstrations to the authors. Examples must illuminate the actual mechanism; undisclosed indices, sizes and code remain unknown.

## Training, inference and evidence

Walk through supervision construction, noise/time sampling and backpropagation, then deployment: branches computed once or repeatedly and cache-update conditions. For generative models define clean/noise endpoints, integration direction and velocity interpretation. Label explanatory pseudocode and distinguish a teaching solver from the implemented solver.

Search Zotero for each related reference. Use local item links and verified physical PDF page links for local evidence; only unfiled papers use web sources. Place comparisons near the mechanism they support, explaining inheritance, differences or evidence boundaries. Naming similarity is not evidence of inheritance. Insert original callouts, figures and tables beside the relevant explanation with intact content and enabled links. Long original quotations may be folded; figures remain visible. A final reference table supplements, rather than replaces, nearby citations.

Explain what each experimental control changes and which claim it supports. Separate cumulative ablation, retraining and same-checkpoint inference changes. Verify timing boundaries/hardware and distinguish author reports, derivations and conjectures.

## Deliver a readable note

Keep management comments in sidecar metadata using the cleanup/restore script; preserve images, formulas, code, ordinary user text and source links. A reader should be able to explain each module in a call, why caching/fusion/sparse interaction works, training/deployment differences and the conditions supported by experiments. If they can only repeat module names, expand the explanation.

For an existing-note request, implement these improvements in the actual saved formula sections and inspect the result. Merely editing the skill does not complete the note edit. Distinguish overloaded symbols, e.g. interaction-stage count $M$ versus attention mask $\mathcal M$.
