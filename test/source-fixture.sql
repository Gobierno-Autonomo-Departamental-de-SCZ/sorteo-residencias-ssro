CREATE TABLE public.periodo(id_periodo integer PRIMARY KEY);
CREATE TABLE public.sedes(id_sedes integer PRIMARY KEY);
CREATE TABLE public.tipo_carrera(id_tipo_carrera integer PRIMARY KEY,nombre text);
CREATE TABLE public.universidad(id_universidad integer PRIMARY KEY,nombre text,extranjero boolean);
CREATE TABLE public.carrera(id_carrera integer PRIMARY KEY,fid_tipo_carrera integer);
CREATE TABLE public.persona(id_persona integer PRIMARY KEY,nombres text,primer_apellido text,segundo_apellido text,documento_identidad text,complemento_documento text,fid_tipo_documento integer);
CREATE TABLE public.estudiante(id_estudiante integer PRIMARY KEY,fid_persona integer,fid_carrera integer,fid_universidad integer,correo_electronico text,estado text);
CREATE TABLE public.establecimiento_salud(id_establecimiento_salud integer PRIMARY KEY,codigo text,establecimiento text,nom_municipio text,estado text);
CREATE TABLE public.habilitacion(id_habilitacion integer PRIMARY KEY,fid_estudiante integer,fid_periodo integer,fid_sedes integer,estado_habilitacion text,estado text,nota numeric,fid_establecimiento_salud integer,asignacion_manual text,_fecha_creacion timestamptz DEFAULT now(),_fecha_modificacion timestamptz);
CREATE TABLE public.cupo_establecimiento_salud(id_cupo_establecimiento_salud integer PRIMARY KEY,fid_establecimiento_salud integer,fid_tipo_carrera integer,fid_periodo integer,fid_sedes integer,cupos integer,cupos_asignados integer,estado text,_fecha_creacion timestamptz DEFAULT now(),_fecha_modificacion timestamptz);
INSERT INTO public.periodo VALUES(1);
INSERT INTO public.sedes VALUES(1);
INSERT INTO public.tipo_carrera VALUES(1,'MEDICINA');
INSERT INTO public.universidad VALUES(1,'UNIVERSIDAD FICTICIA',false);
INSERT INTO public.carrera VALUES(1,1);
INSERT INTO public.persona VALUES(1,'PERSONA','FICTICIA','UNO','123456','',1),(2,'PERSONA','FICTICIA','DOS','222222','',1);
INSERT INTO public.estudiante VALUES(1,1,1,1,'uno@example.invalid','ACTIVO'),(2,2,1,1,'dos@example.invalid','ACTIVO');
INSERT INTO public.establecimiento_salud VALUES(100,'H1','HOSPITAL FICTICIO','MUNICIPIO','ACTIVO');
INSERT INTO public.habilitacion(id_habilitacion,fid_estudiante,fid_periodo,fid_sedes,estado_habilitacion,estado,nota,fid_establecimiento_salud,asignacion_manual)
 VALUES(1,1,1,1,'APROBADO','ACTIVO',80,NULL,''),(2,2,1,1,'ASIGNADO','ACTIVO',90,100,'MOTIVO FICTICIO');
INSERT INTO public.cupo_establecimiento_salud(id_cupo_establecimiento_salud,fid_establecimiento_salud,fid_tipo_carrera,fid_periodo,fid_sedes,cupos,cupos_asignados,estado)
 VALUES(1000,100,1,1,1,5,1,'ACTIVO');
