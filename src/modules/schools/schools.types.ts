export type SchoolCreateInput = {
  code?: string;
  name: string;
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

