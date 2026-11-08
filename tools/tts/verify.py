"""Round-trip pronunciation check: synthesise hard terms with the lexicon, transcribe with faster-whisper,
and report which come back as the intended word. Usage: python verify.py [--no-lexicon]"""
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

import ttslib
from ttslib import speakable

# term spoken -> acceptable transcriptions (lowercase substrings after stripping punctuation)
TERMS = {
    "gracilis": ["gracilis", "gracillus", "gracilus", "grasilis"],
    "cuneatus": ["cuneatus", "cunneatus", "kunia", "cuneatis", "cuniatus", "cunniatus"],
    "fasciculus": ["fasciculus", "fasicular", "fascicus", "fasciculous"],
    "nucleus ambiguus": ["ambiguus", "ambiguous", "ambigus"],
    "abducens": ["abducens", "abducen", "abducins"],
    "trochlear": ["trochlear", "troklear", "trochlea"],
    "Edinger-Westphal": ["edinger", "ettinger"],
    "foramen of Luschka": ["luschka", "lushka", "luska"],
    "foramen of Magendie": ["magendie", "majendi", "magendi", "majandi"],
    "foramen of Monro": ["monro", "munro", "monroe"],
    "aqueduct of Sylvius": ["sylvius", "silvius"],
    "Meyer's loop": ["meyer", "myers", "meier"],
    "Brodmann area 17": ["brodmann", "brotman", "brodman"],
    "uncus": ["uncus", "unkus"],
    "flocculus": ["flocculus", "flockulus"],
    "nodulus": ["nodulus", "nodulous", "nojulus"],
    "tegmentum": ["tegmentum", "tigmentum"],
    "tectum": ["tectum", "tektum"],
    "inferior colliculus": ["colliculus", "calliculus", "kalikulus"],
    "habenula": ["habenula", "habinula"],
    "claustrum": ["claustrum", "clostrum"],
    "putamen": ["putamen", "putamin"],
    "globus pallidus": ["pallidus", "palidus"],
    "substantia nigra": ["substantia", "nigra"],
    "substantia gelatinosa": ["gelatinosa", "jelatinosa", "gelatinoza"],
    "pia mater": ["pia", "pea", "pie"],
    "arachnoid": ["arachnoid", "arachnoid"],
    "falx cerebri": ["falx", "cerebri", "cerebry"],
    "tentorium cerebelli": ["tentorium", "cerebelli", "cerebelli"],
    "calcarine sulcus": ["calcarine", "calcarin"],
    "cingulate gyrus": ["cingulate", "singulate"],
    "parahippocampal gyrus": ["parahippocampal", "para hippocampal"],
    "mammillary body": ["mammillary", "mamillary"],
    "infundibulum": ["infundibulum", "infundibulam"],
    "choroid plexus": ["choroid", "coroid", "kroid"],
    "rhombencephalon": ["rhombencephalon", "rombencephalon", "rhombon"],
    "mesencephalon": ["mesencephalon", "mesen"],
    "diencephalon": ["diencephalon", "diensephalon", "dien"],
    "telencephalon": ["telencephalon", "telensephalon"],
    "myelencephalon": ["myelencephalon", "myelensephalon", "myalen"],
    "decussation": ["decussation", "decusation", "decasation"],
    "medial lemniscus": ["lemniscus", "lemniscis"],
    "cerebral peduncle": ["peduncle", "pedunkle"],
    "glossopharyngeal nerve": ["glossopharyngeal", "glosopharyngeal", "glossofaringeal"],
    "vagus nerve": ["vagus", "vegas"],
    "hypoglossal nerve": ["hypoglossal", "hypoglosal"],
    "nucleus solitarius": ["solitarius", "solitaris"],
    "vestibulocochlear nerve": ["vestibulocochlear", "vestibulocochlea"],
    "Wernicke's area": ["wernicke", "vernicke", "wernike"],
    "Broca's area": ["broca", "brocas"],
    "Klüver-Bucy syndrome": ["bucy", "bucey", "busy"],
    "lenticulostriate arteries": ["lenticulostriate", "lenticulo"],
    "spinothalamic tract": ["spinothalamic", "spino thalamic"],
    "corticobulbar fibers": ["corticobulbar", "cortico bulbar"],
    "Purkinje cells": ["purkinje", "perkinji", "purkinji"],
}


def main():
    use_lex = "--no-lexicon" not in sys.argv
    from faster_whisper import WhisperModel
    from kokoro import KPipeline

    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    asr = WhisperModel("small.en", device="cpu", compute_type="int8")
    ok, bad = 0, []
    outdir = Path(__file__).parent / "test"
    outdir.mkdir(exist_ok=True)
    for term, accept in TERMS.items():
        txt = speakable(term) if use_lex else term
        parts = [a.cpu().numpy() if hasattr(a, "cpu") else a for _, _, a in pipe(txt, voice=ttslib.CFG["voice"], speed=0.95)]
        audio = np.concatenate(parts)
        sf.write(outdir / (re.sub(r"\W+", "_", term) + ".wav"), audio, 24000)
        segs, _ = asr.transcribe(np.interp(np.linspace(0, len(audio), int(len(audio) * 16000 / 24000)), np.arange(len(audio)), audio).astype("float32"), language="en", beam_size=5, initial_prompt="Neuroanatomy terms.")
        heard = re.sub(r"[^a-z ]", "", " ".join(s.text for s in segs).lower())
        hit = any(a in heard for a in accept)
        ok += hit
        if not hit:
            bad.append((term, heard))
        print(("OK  " if hit else "MISS"), term, "->", heard.strip(), flush=True)
    print(f"{ok}/{len(TERMS)} round-trip")
    for t, h in bad:
        print("  miss:", t, "|", h)


if __name__ == "__main__":
    main()
