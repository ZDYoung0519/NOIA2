import { CharacterProps } from "@/pages/character_view/types";
import { supabase } from "@/lib/supabase";

export const uploadCharacterData = async (data: CharacterProps[]) => {
  if (!data.length) {
    return;
  }
  try {
    const { error } = await supabase.from("NOIA2CHARACTER").upsert(data, {
      onConflict: "characterId",
      ignoreDuplicates: false,
    });
    if (error) throw error;
  } catch (err) {
    console.error("上传失败", err);
  } finally {
  }
};
