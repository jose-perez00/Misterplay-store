import { createClient } from "@supabase/supabase-js";

export default async (req) => {

    const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
    };

    if(req.method !== "POST") {
        return new Response(
            JSON.stringify({error:"Método no permitido"}),
            {status:405,headers}
        );
    }

    try {

        const db = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const {projectId} = await req.json();

        if(!/^[0-9a-f-]{36}$/i.test(projectId || "")) {
            throw Error("Identificador inválido");
        }

        const {data:proyecto,error} = await db
        .from("projects")
        .select("id,file_path")
        .eq("id",projectId)
        .eq("status","approved")
        .single();

        if(error || !proyecto) {
            throw Error("Proyecto no disponible");
        }

        const {error:registroError} = await db.rpc(
            "register_download",
            {p_project_id:proyecto.id}
        );

        if(registroError) throw registroError;

        const {data,error:linkError} = await db.storage
        .from("store-files")
        .createSignedUrl(
            proyecto.file_path,
            90,
            {download:true}
        );

        if(linkError) throw linkError;

        return new Response(
            JSON.stringify({url:data.signedUrl}),
            {status:200,headers}
        );

    } catch(error) {

        console.error(error);

        return new Response(
            JSON.stringify({
                error:"No se pudo preparar la descarga."
            }),
            {status:500,headers}
        );

    }

};
