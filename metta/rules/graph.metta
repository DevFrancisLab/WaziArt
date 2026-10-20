; Reasoning-graph edges. Each edge is produced by a query over facts
; and the review rules. The interface renders these results directly.
;
; `let` is used where a helper can return more than one row. In 0.2.10,
; `let` keeps that nondeterminism, and `case` then shapes each row.

(= (graph-edge $id)
   (let $row (live-evidence $id)
     (case $row
       ((($eid $concept) (edge $id has-evidence $eid))
        ($_ (empty))))))

(= (graph-edge $id)
   (let $row (live-evidence $id)
     (case $row
       ((($eid $concept) (edge $eid concept $concept))
        ($_ (empty))))))

(= (graph-edge $id)
   (let $row (supporting-evidence $id)
     (case $row
       ((($eid $concept $criterion) (edge $concept supports $criterion))
        ($_ (empty))))))

(= (graph-edge $id)
   (match &self (evaluated-by $criterion $rule)
     (edge $criterion evaluated-by $rule)))

(= (graph-edge $id)
   (case (collapse (current-permission $id))
     ((() (empty))
      (($status) (edge $id has-permission $status))
      ($_ (edge $id has-permission ambiguous)))))

(= (graph-edge $id)
   (case (collapse (current-theme $id))
     ((() (empty))
      (($theme) (edge $id has-theme $theme))
      ($_ (edge $id has-theme ambiguous)))))

(= (graph-edge $id)
   (let $recommendation (recommendation $id)
     (edge rule-recommendation derives $recommendation)))

(= (graph-edge $id)
   (match &self (challenge $cid $id correct $old $new)
     (edge $cid corrects $old)))

(= (graph-edge $id)
   (match &self (challenge $cid $id dispute $old $new)
     (edge $cid disputes $old)))

(= (graph-edge $id)
   (match &self (revision-compare $rid $id $before $after)
     (edge $rid changes $before $after)))

(= (reasoning-graph $id)
   (collapse (graph-edge $id)))
