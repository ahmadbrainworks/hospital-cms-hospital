import { Db } from 'mongodb';
import {
  PatientRepository,
  CounterService,
} from '@hospital-cms/database';
import { AuditService } from '@hospital-cms/audit';
import { ConflictError } from '@hospital-cms/errors';
import {
  AuditAction,
  UserRole,
  PatientStatus,
  Gender,
} from '@hospital-cms/shared-types';
import type {
  Patient,
  PatientProfile,
  PatientContact,
  EmergencyContact,
  PatientInsurance,
  PatientMedicalInfo,
  PaginatedResult,
} from '@hospital-cms/shared-types';
import type { WithStringId } from '@hospital-cms/database';
import { generateSecureToken } from '@hospital-cms/crypto';

export interface CreatePatientParams {
  hospitalId: string;
  profile: PatientProfile;
  contactInfo: PatientContact;
  emergencyContact?: EmergencyContact;
  insurance?: PatientInsurance[];
  medicalInfo?: Partial<PatientMedicalInfo>;
  actorId: string;
  actorUsername: string;
  actorRole: UserRole;
  traceId: string;
}

export class PatientService {
  private readonly repo: PatientRepository;
  private readonly counter: CounterService;
  private readonly auditService: AuditService;

  constructor(db: Db) {
    this.repo = new PatientRepository(db);
    this.counter = new CounterService(db);
    this.auditService = new AuditService(db);
  }

  async createPatient(
    params: CreatePatientParams
  ): Promise<WithStringId<Patient>> {
    const { hospitalId, profile, contactInfo } = params;

    const patientNumber = await this.counter.nextPatientNumber(hospitalId);
    const mrn = `MRN-${patientNumber}`;

    const mrnExists = await this.repo.mrnExists(hospitalId, mrn);
    if (mrnExists) {
      throw new ConflictError(
        'Generated MRN already exists. Please retry.'
      );
    }

    const patient = await this.repo.insertOne({
      hospitalId,
      patientNumber,
      mrn,
      status: PatientStatus.ACTIVE,
      profile: {
        ...profile,
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
      },
      contactInfo,
      emergencyContact: params.emergencyContact,
      insurance: params.insurance ?? [],
      medicalInfo: {
        allergies: [],
        chronicConditions: [],
        currentMedications: [],
        ...params.medicalInfo,
      },
      registeredBy: params.actorId,
    });

    await this.auditService.log({
      hospitalId,
      traceId: params.traceId,
      action: AuditAction.PATIENT_CREATED,
      actor: {
        userId: params.actorId,
        username: params.actorUsername,
        role: params.actorRole,
      },
      resource: {
        type: 'Patient',
        id: patient._id,
        name: `${profile.firstName} ${profile.lastName}`,
      },
      outcome: 'SUCCESS',
    });

    return patient;
  }

  async getPatient(
    hospitalId: string,
    patientId: string,
    actorId: string,
    actorUsername: string,
    actorRole: UserRole,
    traceId: string,
    includeSensitive = false
  ): Promise<WithStringId<Patient>> {
    const patient = await this.repo.findByIdOrThrow(patientId);

    await this.auditService.log({
      hospitalId,
      traceId,
      action: includeSensitive
        ? AuditAction.PATIENT_SENSITIVE_ACCESSED
        : AuditAction.PATIENT_RECORD_ACCESSED,
      actor: { userId: actorId, username: actorUsername, role: actorRole },
      resource: { type: 'Patient', id: patientId },
      outcome: 'SUCCESS',
    });

    return patient;
  }

  async searchPatients(
    hospitalId: string,
    query: string,
    opts?: { page?: number; limit?: number }
  ): Promise<PaginatedResult<WithStringId<Patient>>> {
    return this.repo.searchPatients(hospitalId, query, opts);
  }

  async updatePatient(
    hospitalId: string,
    patientId: string,
    updates: Partial<Pick<Patient, 'profile' | 'contactInfo' | 'emergencyContact' | 'insurance' | 'medicalInfo' | 'status'>>,
    actorId: string,
    actorUsername: string,
    actorRole: UserRole,
    traceId: string
  ): Promise<WithStringId<Patient>> {
    const before = await this.repo.findByIdOrThrow(patientId);

    const updated = await this.repo.updateById(
      patientId,
      updates as Partial<Omit<Patient, '_id' | 'createdAt'>>
    );

    await this.auditService.log({
      hospitalId,
      traceId,
      action: AuditAction.PATIENT_UPDATED,
      actor: { userId: actorId, username: actorUsername, role: actorRole },
      resource: { type: 'Patient', id: patientId },
      changes: {
        before: { status: before.status },
        after: { status: updated.status },
        fields: Object.keys(updates),
      },
      outcome: 'SUCCESS',
    });

    return updated;
  }

  async deletePatient(
    hospitalId: string,
    patientId: string,
    actorId: string,
    actorUsername: string,
    actorRole: UserRole,
    traceId: string
  ): Promise<void> {
    await this.repo.softDeleteById(patientId, actorId);

    await this.auditService.log({
      hospitalId,
      traceId,
      action: AuditAction.PATIENT_DELETED,
      actor: { userId: actorId, username: actorUsername, role: actorRole },
      resource: { type: 'Patient', id: patientId },
      outcome: 'SUCCESS',
    });
  }
}
