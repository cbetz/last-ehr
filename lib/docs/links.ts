import {
  DOCS_REPOSITORY_URL,
  docsRegistry,
  getDocHref,
  type DocsRegistryEntry,
} from "@/lib/docs/registry";

function normalizeRepositoryPath(fromFile: string, targetPath: string): string {
  const segments = [...fromFile.split("/").slice(0, -1), ...targetPath.split("/")];
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      resolved.pop();
      continue;
    }

    resolved.push(segment);
  }

  return resolved.join("/");
}

export function resolveDocHref(
  href: string,
  currentDoc: DocsRegistryEntry,
): string {
  // GitHub can emit doubled hyphens for punctuation in Markdown headings;
  // the site's heading generator collapses those runs.
  if (href.startsWith("#")) {
    return href.replace(/-+/g, "-");
  }
  if (
    !href ||
    href.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(href)
  ) {
    return href;
  }

  const [pathname, hash] = href.split("#", 2);
  const fragment = hash ? `#${hash}` : "";
  const sourcePath = normalizeRepositoryPath(currentDoc.file, pathname);
  const targetDoc = docsRegistry.find((doc) => doc.file === sourcePath);
  if (targetDoc) {
    return `${getDocHref(targetDoc)}${fragment.replace(/-+/g, "-")}`;
  }

  const isFile = sourcePath.split("/").at(-1)?.includes(".") ?? false;
  const sourceKind = isFile ? "blob" : "tree";
  return `${DOCS_REPOSITORY_URL}/${sourceKind}/main/${sourcePath}${fragment}`;
}
