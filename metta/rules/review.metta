; Review rules.
;
; MeTTa 0.2.10 evaluates a failed (match ...) as no result, not as ().
; (collapse ...) of no result IS the empty expression (), so every
; presence/absence test collapses a match before (case ...) inspects it.
; (empty) is used only to drop a non-matching branch.
;
; `and` in this runtime accepts exactly two arguments, so tests are nested.
;
; Recommendation symbols:
;   recommend_for_review  — required facts align; a person should review it
;   request_information   — something required was never supplied
;   human_review          — supplied facts conflict, are disputed, or do not align
; None of these accepts or rejects the artwork.

; ---- currency -----------------------------------------------------------
; A fact stays in the space after a correction. (superseded-by Old New)
; marks Old as history. Only facts that collapse to () are current.

(= (is-superseded $fid)
   (collapse (match &self (superseded-by $fid $newer) $newer)))

(= (current-title $id)
   (match &self (fact $fid $id title $text)
     (case (is-superseded $fid)
       ((() $text)
        ($_ (empty))))))

(= (current-description $id)
   (match &self (fact $fid $id description $text)
     (case (is-superseded $fid)
       ((() $text)
        ($_ (empty))))))

(= (current-theme $id)
   (match &self (fact $fid $id theme $theme)
     (case (is-superseded $fid)
       ((() $theme)
        ($_ (empty))))))

(= (current-permission $id)
   (match &self (fact $fid $id permission $status)
     (case (is-superseded $fid)
       ((() $status)
        ($_ (empty))))))

(= (live-evidence $id)
   (match &self (fact $fid $id evidence $eid $concept)
     (case (is-superseded $fid)
       ((() ($eid $concept))
        ($_ (empty))))))

; ---- required information ----------------------------------------------
; Each clause is a separate equality, so each missing field is its own result.
; An explicit permission value of `missing` is not the same as `confirmed`.

(= (missing-field $id)
   (case (collapse (current-title $id))
     ((() (missing title))
      (("") (missing title))
      ($_ (empty)))))

(= (missing-field $id)
   (case (collapse (current-description $id))
     ((() (missing description))
      (("") (missing description))
      ($_ (empty)))))

(= (missing-field $id)
   (case (collapse (current-theme $id))
     ((() (missing theme))
      ($_ (empty)))))

(= (missing-field $id)
   (case (collapse (current-permission $id))
     ((() (missing permission))
      ((missing) (missing permission))
      ($_ (empty)))))

(= (missing-field $id)
   (case (collapse (live-evidence $id))
     ((() (missing evidence))
      ($_ (empty)))))

(= (has-missing $id)
   (case (collapse (missing-field $id))
     ((() False)
      ($_ True))))

; ---- permission ---------------------------------------------------------
; True only when the current value is the symbol confirmed.
; No permission fact, `missing`, and `disputed` are all not confirmed.

(= (permission-confirmed $id)
   (case (collapse (current-permission $id))
     (((confirmed) True)
      ($_ False))))

; ---- theme and evidence -------------------------------------------------

(= (theme-aligned $id)
   (match &self (exhibition-theme $expected)
     (case (collapse (current-theme $id))
       ((($expected) True)
        ($_ False)))))

; Inner match succeeds only for concepts declared in schema.metta.
(= (supporting-evidence $id)
   (match &self (fact $fid $id evidence $eid $concept)
     (case (is-superseded $fid)
       ((() (match &self (supports $concept $criterion)
              ($eid $concept $criterion)))
        ($_ (empty))))))

(= (has-support $id)
   (case (collapse (supporting-evidence $id))
     ((() False)
      ($_ True))))

(= (has-live-evidence $id)
   (case (collapse (live-evidence $id))
     ((() False)
      ($_ True))))

; All three positive criteria. Binary `and` is nested on purpose.
(= (review-ready $id)
   (and (and (theme-aligned $id) (permission-confirmed $id))
        (has-support $id)))

; ---- recommendation -----------------------------------------------------
; Dispute wins over missing information: a contested submission needs a
; person even when other fields are still blank. Missing information wins
; over the human-review fallback so an absent permission is not "unclear",
; it is simply not supplied. Anything present but not jointly satisfied
; (wrong theme, evidence that does not support the theme, an unexpected
; permission token) is human_review. There is no accept and no reject.

(= (recommendation $id)
   (if (has-dispute $id)
       human_review
       (if (has-missing $id)
           request_information
           (if (review-ready $id)
               recommend_for_review
               human_review))))

; ---- explanation --------------------------------------------------------
; Every trace item is a result of a rule above. Python displays these
; expressions; it does not invent a parallel explanation.

(= (trace-item $id)
   (let $gap (missing-field $id)
     (trace rule-required $gap)))

(= (trace-item $id)
   (case (collapse (current-title $id))
     ((() (empty))
      (("") (empty))
      (($text) (trace rule-required (supplied title $text)))
      ($_ (trace rule-required (supplied title ambiguous))))))

(= (trace-item $id)
   (case (collapse (current-description $id))
     ((() (empty))
      (("") (empty))
      ($_ (trace rule-required (supplied description uninterpreted))))))

(= (trace-item $id)
   (let $theme (current-theme $id)
     (let $expected (exhibition)
       (if (== $theme $expected)
           (trace rule-theme (aligned $theme))
           (trace rule-theme (not-aligned $theme))))))

(= (trace-item $id)
   (case (collapse (current-permission $id))
     ((() (empty))
      ((confirmed) (trace rule-permission (supplied confirmed)))
      ((missing) (trace rule-permission (supplied missing)))
      ((disputed) (trace rule-permission (supplied disputed)))
      ($_ (trace rule-permission unrecognized)))))

(= (trace-item $id)
   (let $ev (live-evidence $id)
     (trace rule-theme-support (supplied evidence $ev))))

(= (trace-item $id)
   (let $support (supporting-evidence $id)
     (trace rule-theme-support (supports $support))))

(= (trace-item $id)
   (if (and (and (has-live-evidence $id) (not (has-support $id)))
            (and (not (has-dispute $id)) (not (has-missing $id))))
       (trace rule-theme-support evidence-does-not-support-theme)
       (empty)))

(= (trace-item $id)
   (let $signal (dispute-signal $id)
     (trace rule-dispute (disputed $signal))))

(= (trace-item $id)
   (if (and (has-dispute $id) (has-missing $id))
       (trace rule-recommendation dispute-takes-precedence-over-missing-information)
       (empty)))

(= (trace-item $id)
   (if (and (and (not (has-dispute $id)) (not (has-missing $id)))
            (not (review-ready $id)))
       (trace rule-recommendation criteria-not-jointly-satisfied)
       (empty)))

; `outcome` is a data constructor. Naming this call `recommendation`
; would evaluate the rule again instead of quoting its result.
(= (trace-item $id)
   (let $result (recommendation $id)
     (trace rule-recommendation (outcome $result))))

(= (explanation $id)
   (collapse (trace-item $id)))

; Vocabulary queries used by the interface. These read schema facts.
(= (evidence-concept)
   (match &self (supports $concept theme-alignment) $concept))

(= (exhibition)
   (match &self (exhibition-theme $theme) $theme))
