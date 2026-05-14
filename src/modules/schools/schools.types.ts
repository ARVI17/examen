export type SchoolCreateInput = {
  code?: string;
  name: string;
  establecimiento?: string;
  sede?: string;
  departamento?: string;
  municipio?: string;
  departamentoCodigo?: string;
  municipioCodigo?: string;
  sectorOriginal?: string;
  sectorNormalizado?: "OFICIAL" | "NO OFICIAL";
  zona?: string;
  direccion?: string;
  codigoDane?: string;
  estadoFuente?: string;
  fuente?: string;
  fechaFuente?: Date;
  searchLabel?: string;
  nombreNormalizado?: string;
  description?: string;
  isActive?: boolean;
};

export type SchoolUpdateInput = Partial<SchoolCreateInput>;

export type SchoolGroupCreateInput = {
  schoolId: string;
  code?: string;
  name: string;
  grade?: string;
  academicYear?: number;
  isActive?: boolean;
};

export type SchoolGroupUpdateInput = Partial<Omit<SchoolGroupCreateInput, "schoolId">>;
