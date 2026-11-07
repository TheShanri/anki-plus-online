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
          licence with attribution. The solid &ldquo;Brain&rdquo; and &ldquo;Regions&rdquo; looks use gross.glb, a single merged file built from the same Z-Anatomy surface meshes (cortical gyri, cerebellum, brainstem) with sulcal shading baked into vertex colours (tools/atlas/build_gross.cjs); it carries the same licence. Two Z-Anatomy models under non-commercial terms (inner ear, kidney) are not included.
        </p>
      )}
      {!compact && (
      <p className="mt-2">
        MRI slices and structure labels: <A href="https://download.alleninstitute.org/informatics-archive/allen_human_reference_atlas_3d_2020/version_1/">Allen Human Reference Atlas - 3D, 2020</A> (Ding
        et al.; RRID:SCR_017764; &copy; 2019 Allen Institute for Brain Science;{" "}
        <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>); Ding SL et al. (2016) J Comp Neurol 524:3127-3481, doi:10.1002/cne.24080. Template image: ICBM 2009b nonlinear symmetric
        (Fonov et al. 2009, 2011), &copy; 1993-2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University (
        <A href="http://www.bic.mni.mcgill.ca/ServicesAtlases/ICBM152NLin2009">permission to use, copy, modify and distribute with this notice</A>). Tracts (medial lemniscus, medial longitudinal
        fasciculus, spinothalamic, corticospinal, association bundles): <A href="https://doi.org/10.6084/m9.figshare.7375883.v2">Advanced Atlas of 80 Bundles</A> (Garyfallidis et al. 2017 NeuroImage 170:283-297;{" "}
        <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>), curated from the HCP-842 atlas (Yeh et al. 2018 NeuroImage 178:57-68). Periaqueductal grey (and locus coeruleus, raphe, parabrachial and reticular nuclei, kept as optional labels): <A href="https://doi.org/10.5061/dryad.zw3r228d2">Harvard Ascending Arousal Network Atlas v2.0</A> (Edlow &amp; Kinney 2023,
        Dryad; <A href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</A>; Edlow et al. 2023 bioRxiv doi:10.1101/2023.07.13.548265). The internal capsule and pontine
        longitudinal fibres are derived from the Allen labels (method in the viewer), and the 3D meshes of structures missing in Z-Anatomy were generated from them and placed in the Z-Anatomy model by an affine
        registration. Slice viewer: <A href="https://github.com/niivue/niivue">NiiVue</A> (BSD-2-Clause).
      </p>
      )}
    </div>
  );
}
