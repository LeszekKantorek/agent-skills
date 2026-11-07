---
name: technical-writing-rules
description: Write, revise, or review English technical documentation and engineering texts using concrete rules for structure, accuracy, language, and formatting. Use for READMEs, tutorials, how-to guides, runbooks, API references, RFCs, incident reports, release notes, PR descriptions, and commit messages. Do not use for marketing, product UI copy, prompts, or general chat replies.
metadata:
  version: "1.1.0"
---

# Technical writing rules

## Goal

Produce technical text that lets its intended reader act or understand correctly without losing facts, constraints, or uncertainty.

## Steps

### 1. Establish the reader, outcome, and text type

* Read the request, supplied text, and applicable project conventions. Identify the main reader and the task or question the text serves.

| Condition | Instruction |
| --- | --- |
| The audience is implicit | Infer the reader's role and prior knowledge from the task. Ask only when competing interpretations change the content. |
| Readers have conflicting goals | Separate their sections or documents. Link the relevant material instead of addressing every reader in every paragraph. |
| The task is to create text | Select the content type before drafting. Gather the facts needed for its intended outcome in Step 2. |
| The task is to revise text | Preserve the requested scope. Correct wording and structure without silently expanding the subject. |
| The task is to review text | Identify each violation, quote the affected passage, and propose a corrected version. Do not rewrite unrelated passages. |
| The request combines supported and excluded text | Apply these rules to the supported portion. Use the requested conventions for the remaining text. |
| The entire request is outside this skill's scope | Use the instructions appropriate to that task instead. |

* Select one primary purpose for each section. Use the corresponding instructions below.

| Condition | Instruction |
| --- | --- |
| Tutorial: teach through a guided exercise | Identify the exercise's deliverable in the opening. Arrange the work into a guided sequence with observable checkpoints. Link to detailed explanations outside the exercise. |
| How-to or runbook: complete a specific task | Use a title that identifies the task. Specify its starting requirements, execution order, conditional paths, and evidence of completion. |
| Reference: retrieve exact facts | Match the entry structure to the documented interface or system. Cover accepted values, defaults, requirements, limits, side effects, and errors. |
| Explanation: understand a bounded topic | Open with the question to be resolved. Explain how the system works and how its constraints and design decisions produce the described effects. |
| README or RFC: serve several related purposes | Give each section a distinct purpose. Separate instructions, reference facts, and rationale under descriptive headings. |
| PR description, commit message, incident report, or release note | Use the specific pattern in Step 3. Do not force a full documentation structure onto a short engineering text. |

* Continue when the reader, outcome, scope, and applicable content types are clear.

### 2. Establish facts and preserve technical meaning

* Use the available text, code, configuration, tests, schemas, and observed behavior to establish what the document can claim.
* For a wording-only edit, preserve supplied claims unless evidence contradicts them. Do not present preserved claims as independently verified.

| Condition | Instruction |
| --- | --- |
| A new or changed claim describes behavior | Check the relevant implementation or evidence. Do not invent names, guarantees, causes, counts, performance figures, or security properties. |
| Evidence is unavailable | Retain the gap explicitly. Request the missing fact if it blocks a usable result. Otherwise, qualify or omit the unsupported claim. |
| A passage contains code or exact technical text | Preserve code, commands, identifiers, paths, flags, UI names, quoted errors, values, units, and contract keywords during stylistic edits. |
| A technical correction is requested or supported by evidence | Treat it separately from a wording change. Check the correction against its source before applying it. |
| A sentence expresses uncertainty | Preserve the degree of certainty. Distinguish a possible cause from a confirmed cause and an unknown value from a known value. |
| A sentence expresses a requirement, recommendation, permission, or capability | Preserve that distinction. Do not turn advice into an obligation or permission into a guarantee. |
| A style rule conflicts with exact meaning or protected text | Rewrite the surrounding prose first. Preserve the necessary wording if no equivalent rewrite exists. |
| A project specifies a required document format or terminology | Follow that convention where it conflicts with a default here. Apply the remaining rules. |
| A fact changes with versions, dates, or environments | State the relevant version, date, or environment. Avoid volatile details that do not help the reader. |
| A claim depends on a repository count or generated listing | Check the count or listing using the revision covered by the document. Provide a regeneration command when readers need updated results. |
| Supplied text contains stale or misleading claims | Correct or remove them when evidence supports the change. Preserve historical facts with their dates. |
| A claim cites unnamed evidence | Name the supporting source or remove the attribution. Retain any uncertainty that the evidence leaves unresolved. |

* Continue when the supported facts, protected text, and unresolved gaps are identified.

### 3. Apply the writing rules

* Use the facts and boundaries from Step 2. Apply the general rules and the patterns for the selected content types.
* Treat the examples as fictional illustrations. Do not copy their names, numbers, or behavior into an unrelated document.

#### Organize information for the reader

| Condition | Instruction |
| --- | --- |
| Opening a document or section | Give the answer, result, or task first. Omit restatements of the request and announcements of what the text will discuss. |
| Several paths are available | Present the recommended or most common path first. Place alternatives and advanced options after it with criteria for choosing them. |
| A prerequisite or risk affects an action | State it before the action. Do not postpone it to an appendix, note, or later explanation. |
| A concept is needed for the next step | Establish the concept before the reader must apply it. Keep an unfamiliar concept's initial definition below ten words. Put the detailed explanation after that definition. |
| A section could be read independently | Name its subject and necessary context. Replace references to hidden context with explicit names or descriptive links. |
| A paragraph covers several topics | Give each topic its own paragraph. Keep every paragraph within the six-sentence limit. |
| Related sentences lack a clear connection | State the relation with words such as "because", "then", "but", or "as a result". Do not imply unsupported causation. |
| Sections repeat the same information | Keep the authoritative explanation in one place. Repeat only the context needed to understand an independent section or prevent a mistake. |
| A page fragments one coherent task | Combine the fragments. Split pages only when readers, tasks, or content types require different treatment. |
| A conclusion repeats the document | Remove the repetition. Keep a conclusion only when it supplies a decision, consequence, or next action. |

#### Choose words and preserve terminology

| Condition | Instruction |
| --- | --- |
| Several words express the same meaning | Choose the shortest familiar word that preserves the distinction. Use American English spelling unless the project requires another variety. |
| A phrasal verb has a familiar one-word equivalent | Use the one-word verb if it preserves the meaning. Keep established technical phrases when the substitute would change the operation. |
| A technical term names a project concept | Use the established name. Keep the same name for the same concept throughout the document. |
| Different operations have different names | Preserve their distinction. Use "inspect", "measure", "validate", or another exact verb according to the action required. |
| A term or acronym is unfamiliar to the intended reader | Define it at first use. Do not explain familiar product names or standard names merely because they are technical. |
| A word changes meaning within the document | Replace one use with an unambiguous alternative. Do not vary terminology just to avoid repetition. |
| A noun is being improvised as a verb, or the reverse | Use an established verb or noun for the intended action. Retain established domain usage when it adds precision. |
| A new label, metaphor, or invented compound names an ordinary action | Replace it with the action or object it describes. Define a named technical pattern before relying on it. |
| A noun chain has more than three words | Break it with a preposition or clause. Preserve an official name in full, then introduce an unambiguous short form if useful. |
| An idiom, slang term, regional expression, or cultural reference carries the meaning | Replace it with a literal statement. Avoid words whose likely cross-language interpretation changes the meaning. |
| A numeric boundary uses an ambiguous comparison | State the exact relation and unit. Distinguish inclusive from exclusive limits without changing the documented boundary. |
| A person or role is described | Use the relevant role or a neutral term. Remove stereotypes and irrelevant personal characteristics. |

#### Build complete, unambiguous sentences

| Condition | Instruction | Example |
| --- | --- | --- |
| An instruction contains more than 20 words | Divide the instruction into shorter sentences. Retain what triggers the action, what it affects, and what follows from it. | "If the replica is unavailable, pause the export. Resume the export after the replica reconnects." |
| A descriptive sentence contains more than 25 words | Separate the sentence where its meaning permits a break. Make the connection between the resulting statements explicit. | "The worker stores completed jobs for seven days. After seven days, it removes their records." |
| A sentence contains separate instructions or independent new facts | Give each instruction or fact its own sentence. Keep simultaneous actions together only when separating them would misrepresent their timing. | "Hold the latch while you lift the cover." |
| Adjacent sentences have identical openings or lengths | Vary their openings and lengths within the limits. Retain a longer sentence when its single point needs a condition or consequence. | "The scan stops. If the checksum differs, the worker records the mismatch before it exits." |
| The actor is known | Make the actor the subject of an active verb. Reserve passive wording for an unidentified actor or one whose identity does not affect the meaning. | "The scheduler assigns the job." |
| Stable behavior is described | Use the simple present. Use the simple past for completed events and future forms only for actual future events. | "The client retries the request." |
| A complex tense or verbal "-ing" construction obscures an action | Rewrite it with an explicit actor and a simple verb. Preserve established technical terms and necessary time relationships. | Replace "The task has completed, leaving a lock" with "The task completed. The lock remains." |
| A nominalization hides the action | Replace the abstract noun and support verb with a direct verb. | Replace "perform a comparison" with "compare". |
| Shortening removes grammatical structure | Restore articles, necessary verbs, and "that" where they clarify the sentence. Do not write telegraphic fragments as prose. | "Verify that the archive exists before you restore it." |
| Prose contains contractions | Expand them. Preserve contractions inside exact quotations, identifiers, and other protected text. | Replace "doesn't" with "does not". |
| "Only", "not", or another modifier has an unclear scope | Put the modifier next to the word or phrase it modifies. | "The worker deletes only temporary files." |
| A pronoun has several possible referents | Repeat the intended noun when evidence identifies it. Otherwise, request clarification or mark the unresolved referent. Attach "this", "that", and "which" to a specific subject. | Replace "Restart it" with "Restart the indexing service" only when the service is the intended target. |
| A coordinated phrase has two possible groupings | Repeat the article or verb. Use "both", "either", or an explicit condition to fix the grouping. | "Restart the client and the proxy." |
| "And/or" or a prose slash hides alternatives | State whether one option, both options, or exactly one option applies. Preserve slashes in paths and exact technical names. | "Use a token, a certificate, or both." |
| Parentheses interrupt the grammar | Rewrite the parenthetical text as a grammatical unit or a separate sentence. Write the correct singular or plural instead of "(s)". | Replace "Add the node(s)" with "Add the nodes" when multiple nodes are required. |
| A possessive construction is ambiguous | Rewrite it with an explicit relation. | "The policy for the tenant". |
| A semicolon or sentence-level dash joins statements | Replace it with a period or an explicit conjunction. Preserve ranges, negative signs, flags, and hyphens within words. | "The cache expired. Fetch a new token." |

* Count words separated by whitespace. Count each inline code span as one unit. Exclude fenced code and exact quotations from sentence limits.
* Count each sentence within a list item separately. Do not disguise prose as code or a quotation to bypass the limits.

#### Express obligations and uncertainty exactly

| Condition | Instruction | Example |
| --- | --- | --- |
| "Can" identifies what a person or system is able to do | Use "can" only for an established capability or possibility. Do not use it to imply permission when permission matters. | "The client can decode compressed responses." |
| "May" identifies an action that is allowed | State the permission explicitly. Preserve normative keywords in an interface contract. | "The policy permits local caching." Keep `MAY` unchanged in a protocol requirement. |
| "Should" is used for an action that is actually mandatory | Write a direct command in a procedure. Use "must" in a descriptive statement only when the requirement is established. | "Set `region` before you create the client." |
| "Should" identifies a preferred action rather than a requirement | State the recommendation and its reason. Do not turn the recommendation into a requirement. | "We recommend a retry limit because repeated attempts consume the request budget." |
| "May", "might", or "could" marks a possibility that is not established as fact | State what is possible or unknown. Retain the qualifier if a rewrite would strengthen the claim. | "A stale lease is a possible cause. The logs do not establish the cause." |
| "Would" describes a result that depends on an assumed change | State the hypothesis before the result. Do not present a hypothetical change as implemented behavior. | "With the proposed index, the query would avoid a full scan." |
| "Should" opens a conditional clause rather than giving advice | Replace it with "if". | "If the transfer stops, inspect the destination log." |

#### Write procedures and warnings

| Condition | Instruction |
| --- | --- |
| The reader must perform an action | Start with an imperative verb. Address the reader as "you" when an explicit subject is needed. Name the object and location needed to perform the action. |
| A tool performs the action | Put the action before the tool. Use the exact command when readers need to copy it. |
| An action depends on a condition | Put the condition before the command and separate it with a comma. |
| A step depends on a host, file, flag, permission, or earlier result | Identify the dependency before the command. Do not assume that the reader can infer it from source code. |
| Actions must occur in order | Use a numbered list with one main action per step. Add the immediate result or limit beside that action. |
| The reader must recognize success | State the observable result, expected output, or check. Include expected intermediate results where they prevent confusion. |
| A predictable failure has a known remedy | State the symptom and recovery action. Add the cause only when evidence establishes it. |
| An action can cause harm or data loss | Place a warning before the action. Start with the protective command or triggering condition, then state the specific consequence. |
| A warning needs a severity label | Follow the project's labels. Without a project convention, use "Warning" for possible injury. Use "Caution" for possible damage or data loss. |
| Injury and damage risks occur together | Select the label required for injury. Include the damage consequence too when it changes the reader's decision. |
| A note contains a required action or limit | Place the requirement in the relevant procedure step. Keep every action and limit needed for completion in required procedure text. |
| A procedure calls an action "simple", "easy", or "quick" | Remove the judgment. State the actual action, prerequisites, and result. |
| An instruction adds "please" without changing its meaning | Remove the politeness filler. State the action directly. |

#### Remove empty and formulaic language

* Match the phrase's meaning before applying a rule. Preserve technical names, facts, scope, timing, certainty, permission, and obligation.
* If a replacement changes the sentence's meaning, keep the original or rewrite the sentence. Ask for missing facts instead of guessing.
* The examples are fictional. Treat added details as supplied facts, not facts to invent for another document.
* For unlisted wording, name the concrete action or fact. Remove wording that adds neither.

| Condition | Instruction | Example |
| --- | --- | --- |
| "Utilize", "leverage", "harness": ordinary use | Write "use" when the operation stays the same. | "Utilize the local compiler" → "Use the local compiler". |
| "Functionality": unnamed feature | Name the feature. | "The editor has undo functionality" → "The editor has undo". |
| "Enables you to", "allows you to": capability | Write "can". Preserve explicit permission. | "The viewer enables you to rotate pages" → "You can rotate pages in the viewer". |
| "Facilitate", "foster", "empower", "bolster": help | Name the help or supported effect. | "Hints facilitate navigation" → "Hints help readers navigate". |
| "Dive into", "delve into": investigation | Name the inspection or analysis. | "Delve into the crash report" → "Examine the crash report". |
| "Showcase", "underscore", "emphasize": display | Write "show" only when emphasis adds no meaning. | "The table showcases supported encodings" → "The table shows supported encodings". |
| "Embark", "endeavor": starting or trying | Write "start" or "try" without implying success. | "Endeavor to reproduce the timeout" → "Try to reproduce the timeout". |
| "Paradigm", "navigate", "boasts": inflated wording | Name the model, destination, or property. | "The tool boasts offline search" → "The tool has offline search". |
| "Perform", "reach", "repeat": indirect action | Use the exact operation. Keep an already precise verb. | "Perform a reload of the preview" → "Reload the preview". |
| "In order to": purpose | Write "to". | "Open the panel in order to inspect headers" → "Open the panel to inspect headers". |
| "Prior to", "in the event that", "due to the fact that" | Use "before", "if", or "because" for the same relation. | "Save prior to closing the tab" → "Save before closing the tab". |
| "Furthermore", "moreover", "that being said", "notwithstanding" | Use "also", "but", or an explicit exception. | "The file loads. Moreover, its checksum matches" → "The file loads. Its checksum also matches". |
| "However", "therefore", "since": sentence connections | Use "but", "as a result", or "because". Keep temporal "since". | "Since the disk is full, the write fails" → "Because the disk is full, the write fails". |
| "Ensure", "make sure": unspecified check | Name what to inspect and what must hold. | "Ensure a valid port (1–65535)" → "Check that the port is between 1 and 65535, inclusive". |
| "As needed", "as necessary": missing trigger | State the trigger. Ask when it is unknown. | "Refresh as necessary" → Ask: "What condition requires a refresh?". |
| "Gracefully handles": unspecified response | Describe the actual recovery or failure behavior. | "It gracefully handles invalid rows by skipping them" → "It skips invalid rows". |
| "Is designed to", "aims to": intent or behavior | State verified behavior directly. Keep unconfirmed intent explicit. | "The proposal aims to reduce lock contention" → Keep: the reduction is not established. |
| "Supports", "is available": unreleased feature | Remove the claim or label the proposal or dated plan. | "Offline editing is available (planned)" → "Offline editing is planned". |
| "Robust", "powerful", "comprehensive", "performant": unsupported praise | Give the supported property or delete the praise. | "A robust parser that rejects duplicate keys" → "A parser that rejects duplicate keys". |
| "Blazingly fast": unsupported speed claim | Give a measurement and its conditions, or remove the claim. | "Blazingly fast export" → "Export" when no measurement supports the claim. |
| "Streamline", "enhance", "elevate": unspecified improvement | Name the change and any known comparison. | "Streamlines login by removing one prompt" → "Removes one login prompt". |
| "Addresses the issue", "tackles": unnamed correction | Name the fault and corrected behavior. | "Addresses the issue of duplicate alerts" → "Prevents duplicate alerts" when prevention is confirmed. |
| "Pivotal", "crucial", "paramount", "a testament": inflated significance | State the supported consequence. | "The backup is crucial: it is the only recovery copy" → "The backup is the only recovery copy". |
| "Intricate", "nuanced", "multifaceted", "holistic": unexplained complexity | List the relevant parts, limits, or coverage. | "Holistic checks covering lint, builds, and tests" → "Checks: lint, builds, and tests". |
| "Groundbreaking", "cutting-edge", "state-of-the-art", "innovative", "unprecedented" | Identify what is new. Delete unsupported promotion. | "An innovative option for hiding empty columns" → "An option for hiding empty columns". |
| "Transformative", "game-changer", "revolutionize": vague benefit | State the actual effect. | "Revolutionizes review with inline comments" → "Adds inline comments to reviews" when the feature is new. |
| "Meticulous", "meticulously": unsupported process praise | Name the checks performed. | "Meticulously checked field names against the schema" → "Checked field names against the schema". |
| "Plethora", "myriad": quantity | Use "many", or a supported count when relevant. | "A plethora of adapters" → "Many adapters". |
| "E.g.", "i.e.", "etc.": unclear list scope | Use "for example" or "that is". Name omitted items or mark examples. | "Supports formats, e.g. PNG and WebP" → "Supported formats include PNG and WebP". |
| "Out of the box", "under the hood": figurative behavior | State "by default" or "internally" when accurate. | "Uses UTF-8 out of the box" → "Uses UTF-8 by default". |
| "Tapestry", "synergy", "realm", "landscape", "interplay": metaphor | Name the system or relation. Delete empty imagery. | "Within the realm of the build system" → "In the build system". |
| "Vibrant", "bustling", "nestled", "in the heart of": decoration | State the relevant location or activity. | "The file is nestled in the project root" → "The file is in the project root". |
| "Avoid", "acceptable", "complete": distinct meanings | Keep the distinction. Give known limits when they determine acceptance. | "This check can help avoid data loss" ≠ "This check prevents data loss". Keep the qualified claim. |
| "Any", "now": possible scope or timing | Delete only when scope and timing stay unchanged. | "Do not delete any backups" → Keep "any": the prohibition covers every backup. |
| "Simply", "just", "seamlessly", "effortlessly": filler | Remove empty judgments. Keep timing and quantity distinctions. | "Simply select the profile" → "Select the profile". Keep "just" in "The job just finished". |
| "It is worth noting", "it is important to": announcement | Start with the fact or consequence. | "It is worth noting that drafts expire" → "Drafts expire". |
| "When it comes to": topic announcement | Delete the lead-in or use "for". | "When it comes to previews, use sample data" → "For previews, use sample data". |
| "In conclusion", "in summary", "at the end of the day": repetition | Delete the setup. Keep only a new decision, consequence, or action. | "In conclusion, deploy after approval" → "Deploy after approval" if this adds the next action. |
| "Not only … but also", "not X, but Y": rhetorical contrast | State the facts directly. Keep contrasts that prevent misunderstanding. | "Not only saves drafts but also restores them" → "Saves and restores drafts". |
| Three decorative phrases, such as "reliable, dependable, trustworthy" | Keep only distinct information. | "Reliable, dependable, trustworthy storage" → "Reliable storage" if reliability is established. |
| "Ranging from X to Y": false scale | Give real boundaries or label the items as examples. | "Options ranging from CSV export to dark mode" → "Options include CSV export and dark mode". |
| "Hello", "sorry", "as an AI", "let me know": chat residue | Remove conversational text. Keep statements required by the document or policy. | "Let me know if the command fails" → Delete from a command reference. |

#### Format structure and technical examples

| Condition | Instruction |
| --- | --- |
| A standalone document needs a title | Use one top-level heading. Do not skip heading levels. Preserve the hierarchy when editing an embedded section. |
| A heading names a task | Start it with the action verb. Use sentence case and identify the outcome or object. |
| A heading names a concept | Use a descriptive noun phrase or question. Avoid clever titles and generic labels that hide the section's subject. |
| A short passage has a heading | Keep it only when the heading supports navigation or independent lookup. Do not add a heading merely to decorate two sentences. |
| Information has an order | Use a numbered list. Use bullets for parallel unordered items and a table for comparable fields or decisions. |
| Introducing a list | Write a complete introductory sentence. Use a colon when the sentence introduces the items directly. |
| List items differ in grammar or function | Make them parallel. Capitalize sentence items and end complete sentences with periods. Keep fragments consistently punctuated. |
| A list mixes explanations and actions or needs deep nesting | Separate the purposes into paragraphs, lists, or sections. Nest only when the hierarchy carries necessary meaning. |
| A comparison or contract has several consistent fields | Put the fields in a table. Keep required constraints visible instead of burying them in surrounding prose. |
| A link points elsewhere | Use the destination title or a description of its content. Include enough local context to explain why the reader needs it. |
| A cross-reference says "above", "below", "here", or "the following" without a clear target | Name the section, example, or object. Do not rely on screen position. |
| Prose mentions code, paths, flags, parameters, or commands | Format the exact text as inline code. Use fenced blocks with a language label for multiline code and commands. |
| Prose names a UI control | Use its exact label in bold. Do not bold decorative lead-ins or ordinary emphasis. |
| A serial list could be misread | Use the serial comma. Expand ambiguous grouping into an explicit statement. |
| An example is needed to complete the task | Give a complete, copyable example with prerequisites and expected results. Mark placeholders and explain how to replace them. |
| An example includes code | Follow the language and repository indentation conventions. Do not change syntax to satisfy prose rules. |
| An example resembles production data | Use clearly fictional values. Do not include secrets or personal data. |
| A callout adds no actionable distinction | Remove it. Keep callouts for conditions, risks, or optional information that readers need to distinguish. |
| A diagram or screenshot is necessary to explain a spatial or visual relationship | Include it with meaningful alternative text. Keep essential instructions in text and account for updates when the depicted behavior changes. |
| Emoji or decorative formatting substitutes for structure | Replace it with a descriptive heading, list, or sentence. |

#### Apply the pattern for the text type

| Condition | Instruction |
| --- | --- |
| README | Define the project, audience, and problem in the opening paragraph. Put prerequisites before the shortest working example. Follow with relevant configuration, explanation, verification, and troubleshooting. |
| A feature has sharp applicability boundaries | State when to use it and when it does not apply. Give decision criteria for deployment or configuration alternatives. |
| API or configuration reference | Include accepted values, defaults, required status, validation, errors, side effects, and an example for each relevant entry. Keep prose factual. |
| Reference material can be derived from code | Use the authoritative schema or generated facts. Check that the documented interface matches the target version. |
| RFC or design explanation | Separate current behavior from the proposal. State the problem, constraints, decision criteria, alternatives, tradeoffs, and recommendation. Label judgments as judgments. |
| A tutorial or how-to contains extensive rationale | Move the rationale to a separate explanation section or document. Keep the context needed to execute each step correctly. |
| Incident report | State the observed impact and timeline. Use explicit dates, time zones, and simple past for completed events. Separate confirmed causes, hypotheses, and unknowns. |
| Release note or changelog | Describe one change per entry. Give the user-visible effect. Put required migration actions before the consequences of a breaking change. |
| PR description | Lead with the problem and resulting behavior. Add relevant validation and limitations. Link lengthy logs and evidence instead of reproducing them. |
| Commit message | Use an imperative subject unless the repository specifies another convention. Explain the reason or consequence in the body when it adds information. |
| Verification or security document | Define trust inputs, boundaries, assumptions, and non-goals. Name the artifacts to compare and the commands that extract the relevant values. |
| Signed evidence and operational logs support different claims | Distinguish what each establishes. Do not treat a corroborating log as proof of a signature or security property. |
| A security claim uses "secure", "safe", or "trusted" | Define the precise property and conditions, or remove the claim. |

* Continue when the requested text or review covers the reader's goal and preserves the facts and gaps identified in Step 2.

### 4. Check the result and correct violations

* Compare the result with the original request and material. Use every applicable check below before delivery.

| Condition | Instruction |
| --- | --- |
| Checking coverage | Verify that the result serves the selected reader and outcome. Restore omitted requirements, prerequisites, limitations, and important distinctions. |
| Checking technical preservation | Compare protected text, values, negation, conditions, obligation levels, and uncertainty with the input. Correct unintended changes. |
| Checking sentence and paragraph limits | Count all prose sentences and paragraphs under the stated rules. Split violations without weakening meaning. |
| Checking terminology and grammar | Inspect ambiguous pronouns, noun chains, passive constructions, contractions, modal verbs, and sentence-level dashes. Apply the corresponding correction or justified exception. |
| Checking brevity | Remove repetition, filler, unsupported praise, and conversational residue. Retain context needed for a correct decision or action. |
| Checking procedures | Trace prerequisites through actions to visible success and expected recovery. Move required information out of optional notes. |
| Checking examples | Verify names, syntax, placeholders, and expected results against available evidence. Run examples only when safe and authorized. Do not claim an unrun example was tested. |
| Checking navigation and retrieval | Read each major section in isolation. Restore its subject or necessary context when the excerpt becomes ambiguous. |
| Checking Markdown | Verify heading hierarchy, table columns, fences, descriptive links, and formatting of technical text. |
| Checking maintainability | Verify time-sensitive claims against the stated version or date. Remove unnecessary details likely to become stale. |
| Delivering a rewrite | Return the requested artifact. Add a brief note only for material unresolved facts or validation limits that affect its use. |
| Delivering a review | Return the affected passages, violated instructions, and proposed corrections. Separate confirmed errors from facts that still need verification. |

* Repeat the affected checks after corrections. Finish when the requested result meets the applicable rules and material unresolved gaps remain explicit.
