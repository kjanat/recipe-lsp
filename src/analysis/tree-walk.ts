import type { Node } from "web-tree-sitter";

/**
 * Pre-order DFS over `root`'s subtree via a tree-sitter cursor: O(1) heap and no
 * per-node `children` array allocation, which matters on the half-parsed trees
 * these passes walk on every keystroke. `visitedChildren` tracks whether we have
 * already descended, so we move down → across → up without revisiting.
 *
 * Return `false` from `visit` to prune — the node's children are skipped. Any
 * other return value (including `undefined`) descends. The cursor holds a wasm
 * handle, so it must be `delete`d.
 */
export function walk(root: Node, visit: (node: Node) => unknown): void {
	const cursor = root.walk();

	try {
		let visitedChildren = false;

		for (;;) {
			if (!visitedChildren) {
				const descend = visit(cursor.currentNode) !== false;
				if (descend && cursor.gotoFirstChild()) {
					continue;
				}
				visitedChildren = true;
			}

			if (cursor.gotoNextSibling()) {
				visitedChildren = false;
				continue;
			}

			if (!cursor.gotoParent()) {
				break;
			}
		}
	} finally {
		cursor.delete();
	}
}
