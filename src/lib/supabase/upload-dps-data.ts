import { HistoryTargetRecord } from "@/types/aion2dps";
import { supabase } from "@/lib/supabase/supabase";

export const uploadDpsDataBatch = async (records: HistoryTargetRecord[]) => {
  try {
    const toUploadData = records.map((data) => {
      const targetId = data.targetId;
      const targetInfo = data.combatInfos.targetInfos[targetId];
      const mainActorName = data.combatInfos.mainActorName;
      const mainActorId = data.combatInfos.mainActorId;
      const mainActorServerId = data.combatInfos.actorInfos[String(mainActorId)].actorServerId;

      return {
        record_id: data.id,
        created_at: new Date().toISOString(), // 转换为 ISO 字符串
        profile: {
          id: targetInfo.id,
          targetMobCode: targetInfo.targetMobCode,
          targetName: targetInfo.targetName,
          isBoss: targetInfo.isBoss,
          targetStartTime: targetInfo.targetStartTime,
          targetLastTime: targetInfo.targetLastTime,
          mainActorId: mainActorId,
          mainActorName: mainActorName,
          mainActorServerId: mainActorServerId,
        },
        data: data,
      };
    });

    const { error } = await supabase.from("NOIA2DPS").upsert(toUploadData, {
      onConflict: "record_id",
      ignoreDuplicates: false,
    });

    if (error) throw error;

    console.log(`✅ 成功上传 ${toUploadData.length} 条记录`);
  } catch (err) {
    console.error("❌ 批量上传失败:", err);
    throw err;
  }
};
