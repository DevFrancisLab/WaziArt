; Challenge, correction, and revision rules.
;
; History is append-only. A correction adds (superseded-by Old New) and a
; new fact. A dispute adds (dispute Id Artwork FactId) and leaves the
; original fact current, so the conflict stays visible.
;
; dispute-signal is defined here and used by the recommendation rule.
; MeTTa resolves that call when the query runs, after every file is loaded.

; A permission fact whose current value is disputed.
(= (dispute-signal $id)
   (match &self (fact $fid $id permission disputed)
     (case (is-superseded $fid)
       ((() permission)
        ($_ (empty))))))

; A dispute event that still points at a current fact.
; Once that fact is superseded, the dispute remains in history but no
; longer changes the recommendation.
(= (dispute-signal $id)
   (match &self (dispute $did $id $fid)
     (case (is-superseded $fid)
       ((() $fid)
        ($_ (empty))))))

(= (has-dispute $id)
   (case (collapse (dispute-signal $id))
     ((() False)
      ($_ True))))

(= (live-fact $id title $fid)
   (match &self (fact $fid $id title $text)
     (case (is-superseded $fid)
       ((() $fid)
        ($_ (empty))))))

(= (live-fact $id description $fid)
   (match &self (fact $fid $id description $text)
     (case (is-superseded $fid)
       ((() $fid)
        ($_ (empty))))))

(= (live-fact $id theme $fid)
   (match &self (fact $fid $id theme $theme)
     (case (is-superseded $fid)
       ((() $fid)
        ($_ (empty))))))

(= (live-fact $id permission $fid)
   (match &self (fact $fid $id permission $status)
     (case (is-superseded $fid)
       ((() $fid)
        ($_ (empty))))))

(= (live-evidence-fact $id $eid $fid)
   (match &self (fact $fid $id evidence $eid $concept)
     (case (is-superseded $fid)
       ((() $fid)
        ($_ (empty))))))

(= (live-note-fact $id $eid $fid)
   (match &self (fact $fid $id evidence-note $eid $text)
     (case (is-superseded $fid)
       ((() $fid)
        ($_ (empty))))))

; Both arguments are recommendation symbols already inferred by MeTTa.
; This does not re-decide the submission; it records whether the two
; inferred results differ.
(= (outcome-delta $before $after)
   (if (== $before $after)
       (unchanged $before)
       (changed $before $after)))

; Current records, including fact ids, so a challenge can name a fact.
(= (live-record $id)
   (match &self (fact $fid $id title $text)
     (case (is-superseded $fid)
       ((() (record $fid title $text))
        ($_ (empty))))))

(= (live-record $id)
   (match &self (fact $fid $id description $text)
     (case (is-superseded $fid)
       ((() (record $fid description $text))
        ($_ (empty))))))

(= (live-record $id)
   (match &self (fact $fid $id theme $theme)
     (case (is-superseded $fid)
       ((() (record $fid theme $theme))
        ($_ (empty))))))

(= (live-record $id)
   (match &self (fact $fid $id permission $status)
     (case (is-superseded $fid)
       ((() (record $fid permission $status))
        ($_ (empty))))))

(= (live-record $id)
   (match &self (fact $fid $id evidence $eid $concept)
     (case (is-superseded $fid)
       ((() (record $fid evidence $eid $concept))
        ($_ (empty))))))

(= (live-record $id)
   (match &self (fact $fid $id evidence-note $eid $text)
     (case (is-superseded $fid)
       ((() (record $fid evidence-note $eid $text))
        ($_ (empty))))))

(= (known-artwork $id)
   (match &self (audit $aid submitted $id $ref) $id))

(= (artwork-ids)
   (unique (known-artwork $id)))

(= (revision-of $id)
   (match &self (revision-compare $rid $id $before $after)
     (revision $rid $before $after)))

(= (challenge-of $id)
   (match &self (challenge $cid $id $action $old $new)
     (challenge-view $cid $action $old $new)))

(= (note-of $cid)
   (match &self (challenge-note $cid $text) $text))
