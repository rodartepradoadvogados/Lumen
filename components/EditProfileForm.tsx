"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { updateMyProfile, type MyProfile } from "@/lib/actions/profile";
import MaskedInput from "@/components/MaskedInput";
import { maskCPF, maskCEP } from "@/lib/masks";
import ImageCropperModal from "@/components/ImageCropperModal";

const GENDER_OPTIONS = ["Feminino", "Masculino", "Não-binário", "Prefiro não informar"];
const MARITAL_OPTIONS = ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"];
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"];

export default function EditProfileForm({ profile, userId, initials }: { profile: MyProfile; userId: string; initials: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // profile.photoUrl é o link PRIVADO do Vercel Blob (não acessível pelo navegador) — a URL
  // exibível é sempre a rota de proxy, ver app/api/perfil/foto/[userId]/route.ts.
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl ? `/api/perfil/foto/${userId}` : null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadPhoto(file: Blob) {
    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file, "foto-perfil.jpg");
    try {
      const res = await fetch("/api/perfil/foto/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao enviar foto.");
      } else {
        setPhotoUrl(`/api/perfil/foto/${userId}?t=${Date.now()}`);
        router.refresh();
      }
    } catch {
      setError("Erro ao enviar foto. Verifique sua conexão.");
    } finally {
      setUploading(false);
    }
  }

  function submit(formData: FormData) {
    setError(null);
    setSuccess(false);
    const data: Omit<MyProfile, "photoUrl"> = {
      name: String(formData.get("name") || ""),
      birthDate: String(formData.get("birthDate") || "") || null,
      gender: String(formData.get("gender") || "") || null,
      maritalStatus: String(formData.get("maritalStatus") || "") || null,
      cpf: String(formData.get("cpf") || "") || null,
      rg: String(formData.get("rg") || "") || null,
      address: String(formData.get("address") || "") || null,
      cep: String(formData.get("cep") || "") || null,
      city: String(formData.get("city") || "") || null,
      state: String(formData.get("state") || "") || null,
    };
    startTransition(async () => {
      const result = await updateMyProfile(data);
      if (result.error) setError(result.error);
      else {
        setSuccess(true);
        router.refresh();
      }
    });
  }

  return (
    <form action={submit} className="space-y-5">
      <div className="flex items-center gap-4">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative h-20 w-20 rounded-full bg-grafite-800 text-marca flex items-center justify-center text-xl font-bold shrink-0 cursor-pointer overflow-hidden group"
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <UploadCloud size={20} className="text-white" />
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs font-semibold text-marca-tx hover:text-marca-tx disabled:opacity-50"
          >
            {uploading ? "Enviando..." : "Trocar foto"}
          </button>
          <p className="text-[11px] text-tx-2 mt-0.5">Aparece no lugar das iniciais em todo o sistema.</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPendingFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {pendingFile && (
        <ImageCropperModal
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={(blob) => {
            setPendingFile(null);
            uploadPhoto(blob);
          }}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-tx-2">Nome</label>
          <input name="name" defaultValue={profile.name} required className="profile-input w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Data de nascimento</label>
          <input name="birthDate" type="date" defaultValue={profile.birthDate ?? ""} className="profile-input w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Gênero</label>
          <select name="gender" defaultValue={profile.gender ?? ""} className="profile-input w-full">
            <option value="">Não informado</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Estado civil</label>
          <select name="maritalStatus" defaultValue={profile.maritalStatus ?? ""} className="profile-input w-full">
            <option value="">Não informado</option>
            {MARITAL_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">CPF</label>
          <MaskedInput name="cpf" mask={maskCPF} defaultValue={profile.cpf ?? ""} placeholder="000.000.000-00" className="profile-input w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">RG</label>
          <input name="rg" defaultValue={profile.rg ?? ""} className="profile-input w-full" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-tx-2">Endereço completo</label>
          <input name="address" defaultValue={profile.address ?? ""} placeholder="Rua, número, complemento, bairro" className="profile-input w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">CEP</label>
          <MaskedInput name="cep" mask={maskCEP} defaultValue={profile.cep ?? ""} placeholder="00000-000" className="profile-input w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Cidade</label>
          <input name="city" defaultValue={profile.city ?? ""} className="profile-input w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Estado</label>
          <select name="state" defaultValue={profile.state ?? ""} className="profile-input w-full">
            <option value="">Selecione</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-[11px] text-urgente bg-urgente-bg border border-urgente/20 px-2.5 py-1.5">{error}</p>}
      {success && <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/15 border border-emerald-200 dark:border-emerald-400/20 px-2.5 py-1.5">Perfil atualizado com sucesso.</p>}

      <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50">
        {pending ? "Salvando..." : "Salvar alterações"}
      </button>

      <style jsx>{`
        .profile-input { border: 1px solid rgba(15, 31, 61, 0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; background: #fff; color: #14213d; }
        .profile-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198, 160, 92, 0.4); }
        :global(.dark) .profile-input { background: #111a35; border-color: rgba(255, 255, 255, 0.15); color: #f1ece0; }
      `}</style>
    </form>
  );
}
