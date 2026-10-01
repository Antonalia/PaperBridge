# Key points, formulas and worked examples

[简体中文](explanation-patterns.md) | **English**

## Explain key points

A key annotation explains what the author says, why it matters to the argument, the mechanism, supporting evidence and applicable assumptions/limits. Do not merely translate a highlight or convert a proposal into a verified result. A short format can include **Point**, **Mechanism**, **Evidence and limits**, and **Constructed teaching example**. Choose the parts needed rather than imposing a long template on every comment.

## Explain each core formula

1. Transcribe the original and locate it by equation number, physical page and section. Label reorganizations, supplemented definitions or equivalent expressions as explanatory rewrites, separately from the original.
2. Define every symbol: meaning, scalar/vector/tensor/distribution/function type, dimension, source and whether known in training/inference. Distinguish random variables from values, conditions from targets, samples from latents, execution time from diffusion steps. Derive dimensions only from the paper or reliable structural relations; label structural deductions and otherwise state “not specified.”
3. Explain what is predicted/optimized/decomposed, how key terms affect behavior and where the output goes. State assumptions for conditional independence, approximations and omitted terms.
4. Give concrete inputs, a complete substitution/calculation or conditional-sampling step, and a result. A robot/cup analogy alone is insufficient. Use a small discrete distribution with stated assumptions when a probabilistic expression cannot be evaluated directly, or a scalar/small-vector component for a large network; state the simplification.
5. Explain common misreadings: symbolic quantities versus implementation parameters, training versus inference, generated outcomes versus physical validation. Separate paper assumptions from teaching assumptions.

For many symbols, use a nearby table with symbol, meaning/type, dimension/range, availability at this stage and definition source. A generic table might describe target vector $x\in\mathbb R^d$, given condition $c$ with unspecified shape, and learned function $f_\theta$; these are examples, not any paper's definitions.

## A verifiable loss example

The expression and values below are constructed for teaching. Map them to a paper only if that paper actually uses this loss:

$$L=\frac1d\sum_{i=1}^d(\hat y_i-y_i)^2.$$

Here $y=(0.2,-0.5)$ is the target, $\hat y=(0.3,-0.3)$ the prediction, $i$ the component index and $d=2$ the vector length; $L$ is the mean squared error. Residuals are $(0.1,0.2)$, squared terms $(0.01,0.04)$ and $L=0.025$. If the paper uses a sum, the result is $0.05$; do not silently add averaging. This illustrates computation, not training or measured accuracy.

## Pitfalls

- Symbols can be overloaded; explain local definitions separately. Preserve subscripts, superscripts, sets and conditioning bars. Do not invent world-model states or rewards.
- Likelihood, denoising loss and task success rate differ. A lower loss does not prove better real manipulation without experiments.
- State baseline and denominator: 40% to 60% means +20 percentage points or +50% relative, not +20%. If the paper's denominator is unclear, retain that uncertainty.
- State task, split, real/simulated setting, assessment method and controls. Visual consistency of offline rollouts is not real closed-loop robot success.
- Label derivations, inferred dimensions, pseudocode and teaching values with their evidence/assumptions. Preserve unreadable math as an uncertainty with location rather than asserting a transcription.

## Markdown and comments

Use comments for local explanations and necessary examples; use Markdown for complete derivations, symbol tables and experiments. Both should use the same verified equation numbers and physical pages. Use `$...$` and `$$...$$`; source remains deliverable even if a client cannot render it.

Paper sources may use returned Zotero item URIs. Exact page links require a verified PDF attachment key and physical page: `zotero://open-pdf/library/items/<key>?page=<page>` for personal-library PDFs. Annotation links use the bridge's link tool and per-kind switches; do not construct disabled links manually. Ordinary Markdown does not require Obsidian.
