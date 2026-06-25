import sys, json
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from graphify.llm import _placeholder_community_labels
from pathlib import Path

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding="utf-8"))
detection  = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding="utf-8"))

G = build_from_json(extraction, directed=False, root=Path('.'))
print(f'Graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges')

communities = cluster(G)
print('Clusters assigned')

cohesion_scores = score_all(G, communities)
gods = god_nodes(G)
surprises = surprising_connections(G)

# Use placeholder labels since LLM is not configured
community_labels = _placeholder_community_labels(communities)

questions = suggest_questions(G, communities, community_labels)

token_cost = {'input_tokens': extraction.get('input_tokens', 0), 'output_tokens': extraction.get('output_tokens', 0)}

report = generate(G, communities, cohesion_scores, community_labels, gods, surprises, detection, token_cost, '.', suggested_questions=questions)
Path('graphify-out/GRAPH_REPORT.md').write_text(report, encoding="utf-8")

to_json(G, communities, 'graphify-out/graph.json', force=True, community_labels=community_labels)
Path('graphify-out/.graphify_analysis.json').write_text(json.dumps({
    'god_nodes': gods,
    'surprising_connections': surprises,
    'suggested_questions': questions
}, ensure_ascii=False), encoding="utf-8")
print('Wrote GRAPH_REPORT.md, graph.json, .graphify_analysis.json')
