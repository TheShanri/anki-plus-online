const LINK = "text-accent-2 underline underline-offset-2 hover:text-text";

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className={LINK} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function AtlasAttribution({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "text-xs text-text-faint" : "text-sm text-text-dim"}>
      <p>
        3D models: <A href="https://www.z-anatomy.com/">Z-Anatomy</A> (
        <A href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</A>), derived from{" "}
        <A href="https://lifesciencedb.jp/bp3d/">BodyParts3D</A> &copy; DBCLS (
        <A href="https://creativecommons.org/licenses/by-sa/2.1/jp/">CC BY-SA 2.1 JP</A>); cranial nerves:{" "}
        <A href="https://www.dundee.ac.uk/">University of Dundee</A> (
        <A href="https://creativecommons.org/licenses/by/4.0/">CC BY</A>).
      </p>
      {!compact && (
        <p className="mt-2">
          The converted GLB files served from <code className="font-mono text-xs">/atlas/</code> are adapted from the{" "}
          <A href="https://github.com/Z-Anatomy/Models-of-human-anatomy">Z-Anatomy models</A> (nervous system only; split into one
          file per structure, decimated, and compressed) and are shared under{" "}
          <A href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</A>. You may copy and adapt them under the same
          licence with attribution. Two Z-Anatomy models under non-commercial terms (inner ear, kidney) are not included.
        </p>
      )}
    </div>
  );
}
